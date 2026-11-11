-- Studio shop orders: prices come from the items; stock is held when the order is placed and
-- given back when it is cancelled or refunded before collection; the order follows its
-- payment request; only the family sees its orders; only the studio marks ready/collected;
-- an ordered item is hidden instead of deleted.
-- Fixture: client-portal seed. Studio …01: admin …0e, Alice …0a (account with Ari …0c,
-- active engagement …0a), Bob …0b (engagement …0b).
\o /dev/null
CREATE TEMP TABLE ids AS SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid AS studio,
  'b0000000-0000-4000-8000-00000000000e'::uuid AS admin,
  'b0000000-0000-4000-8000-00000000000a'::uuid AS alice_u,
  'b0000000-0000-4000-8000-00000000000c'::uuid AS ari_u,
  'b0000000-0000-4000-8000-00000000000b'::uuid AS bob_u,
  'c0000000-0000-4000-8000-00000000000a'::uuid AS alice,
  'f0000000-0000-4000-8000-00000000000a'::uuid AS alice_enrolment;
GRANT SELECT ON ids TO PUBLIC;
CREATE TEMP TABLE t (k TEXT PRIMARY KEY, v UUID);
GRANT ALL ON t TO PUBLIC;
\o

CREATE FUNCTION pg_temp.as_user(p_user UUID) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_user::text, false);
$$;
CREATE FUNCTION pg_temp.v(p_k TEXT) RETURNS UUID LANGUAGE sql AS $$ SELECT v FROM t WHERE k = p_k $$;

-- Settle an order's request with a succeeded payment, as the payment callback does.
CREATE FUNCTION pg_temp.pay(p_order UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_pay UUID;
BEGIN
  INSERT INTO payments (tenant_id, charge_type, provider, status, pretax_amount_minor, total_amount_minor, currency, person_id)
  SELECT tenant_id, 'initial', 'mock', 'succeeded', total_minor, total_minor, currency, person_id
    FROM shop_orders WHERE id = p_order RETURNING id INTO v_pay;
  UPDATE job_payment_requests SET status = 'paid', payment_id = v_pay, paid_at = now() WHERE shop_order_id = p_order;
END;
$$;
CREATE FUNCTION pg_temp.refund(p_order UUID) RETURNS VOID LANGUAGE sql AS $$
  UPDATE job_payment_requests SET status = 'refunded_manual', refunded_at = now() WHERE shop_order_id = p_order;
$$;

CREATE FUNCTION pg_temp.expect_fail(p_user UUID, p_sql TEXT, p_expect TEXT, p_label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_user(p_user);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%' || p_expect || '%' THEN
      RAISE EXCEPTION 'FAIL %: expected "%", got "%"', p_label, p_expect, SQLERRM;
    END IF;
    RAISE NOTICE 'ok  %', p_label;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL %: it worked but should not have', p_label;
END;
$$;

-- The studio's items: a leotard (Age 4-6: 2 in stock, Adult: not counted) and hidden tights.
DO $$
DECLARE v_id UUID; v_hidden UUID;
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  v_id := save_shop_product(jsonb_build_object('name', 'Black leotard', 'price_minor', 12000,
    'variants', jsonb_build_array(jsonb_build_object('label', 'Age 4-6', 'stock', 2),
                                  jsonb_build_object('label', 'Adult'))));
  v_hidden := save_shop_product('{"name":"Old tights","price_minor":3000,"active":false}');
  INSERT INTO t VALUES ('product', v_id),
    ('small', (SELECT id FROM shop_product_variants WHERE product_id = v_id AND label = 'Age 4-6')),
    ('adult', (SELECT id FROM shop_product_variants WHERE product_id = v_id AND label = 'Adult')),
    ('hidden', (SELECT id FROM shop_product_variants WHERE product_id = v_hidden));
END $$;

-- 1. Without the feature families see nothing and cannot order.
DO $$
BEGIN
  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  IF get_shop_catalogue() <> '[]'::jsonb THEN RAISE EXCEPTION 'FAIL catalogue without the feature'; END IF;
  RAISE NOTICE 'ok  no catalogue without the feature';
END $$;
SELECT pg_temp.expect_fail((SELECT alice_u FROM ids),
  format('SELECT place_shop_order(%L)', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.v('adult')))),
  'switched_off', 'no orders without the feature');

INSERT INTO tenant_feature_overrides (tenant_id, feature_key, is_enabled)
SELECT studio, 'billing:studio_shop', true FROM ids;

-- 2. The catalogue shows shown items only, with sizes in order and stock.
DO $$
DECLARE c JSONB;
BEGIN
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  c := get_shop_catalogue();
  IF jsonb_array_length(c) <> 1 OR c->0->>'name' <> 'Black leotard'
     OR c->0->'variants'->0->>'label' <> 'Age 4-6' OR (c->0->'variants'->0->>'stock')::int <> 2
     OR c->0->'variants'->1->'stock' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL catalogue: %', c;
  END IF;
  RAISE NOTICE 'ok  catalogue: shown items, sizes in order, stock';
END $$;

-- 3. Ari orders for Alice (same family): price from the item, stock held, request on Alice's enrolment.
DO $$
DECLARE r JSONB; v_req job_payment_requests%ROWTYPE;
BEGIN
  PERFORM pg_temp.as_user((SELECT ari_u FROM ids));
  r := place_shop_order(jsonb_build_array(
         jsonb_build_object('variant_id', pg_temp.v('small'), 'quantity', 2, 'price_minor', 1),
         jsonb_build_object('variant_id', pg_temp.v('adult'))),
       (SELECT alice FROM ids));
  INSERT INTO t VALUES ('order1', (r->>'order_id')::uuid);
  IF (r->>'total_minor')::int <> 36000 OR r->>'pay_token' IS NULL THEN RAISE EXCEPTION 'FAIL total: %', r; END IF;
  SELECT * INTO v_req FROM job_payment_requests WHERE shop_order_id = pg_temp.v('order1');
  IF v_req.engagement_id <> (SELECT alice_enrolment FROM ids) OR v_req.amount_minor <> 36000
     OR v_req.label <> 'Black leotard (Age 4-6) ×2, Black leotard (Adult)' THEN
    RAISE EXCEPTION 'FAIL request: % % %', v_req.engagement_id, v_req.amount_minor, v_req.label;
  END IF;
  IF (SELECT stock FROM shop_product_variants WHERE id = pg_temp.v('small')) <> 0
     OR (SELECT stock FROM shop_product_variants WHERE id = pg_temp.v('adult')) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL stock not held';
  END IF;
  RAISE NOTICE 'ok  family orders for a child: price from the item, stock held, paid via the enrolment';
END $$;

-- 4. Sold out, hidden items, bad quantities and other families are refused.
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT place_shop_order(%L)', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.v('small')))),
  'sold_out', 'a sold-out size cannot be ordered');
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT place_shop_order(%L)', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.v('hidden')))),
  'item_not_found', 'a hidden item cannot be ordered');
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT place_shop_order(%L)', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.v('adult'), 'quantity', 0))),
  'bad_quantity', 'quantity must be 1 to 20');
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT place_shop_order(%L, %L)', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.v('adult'))), (SELECT alice FROM ids)),
  'access denied', 'cannot order for another family');
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids), 'SELECT place_shop_order(''[]'')', 'empty_cart', 'an empty cart is refused');

-- 5. Only the family sees the order, with its pay link; only the studio lists all orders.
DO $$
DECLARE o JSONB;
BEGIN
  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  o := get_my_shop_orders();
  IF jsonb_array_length(o) <> 1 OR o->0->>'pay_token' IS NULL OR o->0->>'person_name' <> 'Alice'
     OR jsonb_array_length(o->0->'lines') <> 2 THEN
    RAISE EXCEPTION 'FAIL Alice orders: %', o;
  END IF;
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  IF get_my_shop_orders() <> '[]'::jsonb THEN RAISE EXCEPTION 'FAIL Bob sees Alice''s order'; END IF;
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  o := get_studio_shop_orders();
  IF jsonb_array_length(o) <> 1 OR o->0->>'ordered_by_name' <> 'Ari' THEN RAISE EXCEPTION 'FAIL studio list: %', o; END IF;
  RAISE NOTICE 'ok  family sees its own orders; the studio sees all';
END $$;
SELECT pg_temp.expect_fail((SELECT alice_u FROM ids), 'SELECT get_studio_shop_orders()', 'access denied', 'parents cannot list the studio''s orders');
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids), format('SELECT cancel_shop_order(%L)', pg_temp.v('order1')),
  'not_found', 'another family cannot cancel the order');
SELECT pg_temp.expect_fail((SELECT alice_u FROM ids), format('SELECT set_shop_order_status(%L, ''ready'')', pg_temp.v('order1')),
  'not_found', 'parents cannot mark orders ready');
SELECT pg_temp.expect_fail((SELECT admin FROM ids), format('SELECT set_shop_order_status(%L, ''ready'')', pg_temp.v('order1')),
  'order_is_awaiting_payment', 'an unpaid order cannot be marked ready');

-- 6. Cancelling an unpaid order cancels its request and gives the stock back.
DO $$
BEGIN
  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  PERFORM cancel_shop_order(pg_temp.v('order1'));
  IF (SELECT status FROM shop_orders WHERE id = pg_temp.v('order1')) <> 'cancelled'
     OR (SELECT status FROM job_payment_requests WHERE shop_order_id = pg_temp.v('order1')) <> 'cancelled'
     OR (SELECT stock FROM shop_product_variants WHERE id = pg_temp.v('small')) <> 2 THEN
    RAISE EXCEPTION 'FAIL cancel';
  END IF;
  PERFORM cancel_shop_order(pg_temp.v('order1'));  -- twice is fine, stock not given back twice
  IF (SELECT stock FROM shop_product_variants WHERE id = pg_temp.v('small')) <> 2 THEN RAISE EXCEPTION 'FAIL double release'; END IF;
  IF get_my_shop_orders() <> '[]'::jsonb THEN RAISE EXCEPTION 'FAIL cancelled order still listed'; END IF;
  RAISE NOTICE 'ok  cancelling gives the stock back once';
END $$;

-- 7. Paying the request marks the order paid; then ready and collected.
DO $$
DECLARE r JSONB;
BEGIN
  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  r := place_shop_order(jsonb_build_array(jsonb_build_object('variant_id', pg_temp.v('small'))));
  INSERT INTO t VALUES ('order2', (r->>'order_id')::uuid);
  PERFORM pg_temp.pay(pg_temp.v('order2'));
  IF (SELECT status FROM shop_orders WHERE id = pg_temp.v('order2')) <> 'paid' THEN RAISE EXCEPTION 'FAIL not paid'; END IF;
  IF (get_my_shop_orders()->0->>'pay_token') IS NOT NULL THEN RAISE EXCEPTION 'FAIL pay link after paying'; END IF;
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  IF set_shop_order_status(pg_temp.v('order2'), 'ready') <> 'ready'
     OR set_shop_order_status(pg_temp.v('order2'), 'collected') <> 'collected' THEN
    RAISE EXCEPTION 'FAIL ready/collected';
  END IF;
  IF (SELECT collected_at FROM shop_orders WHERE id = pg_temp.v('order2')) IS NULL THEN RAISE EXCEPTION 'FAIL collected_at'; END IF;
  RAISE NOTICE 'ok  paid, ready to collect, collected';
END $$;
SELECT pg_temp.expect_fail((SELECT alice_u FROM ids), format('SELECT cancel_shop_order(%L)', pg_temp.v('order2')),
  'already_paid', 'a paid order cannot be cancelled by the family');

-- 8. A refund after collection keeps the stock as it is; a refund before collection gives it back.
DO $$
DECLARE r JSONB;
BEGIN
  PERFORM pg_temp.refund(pg_temp.v('order2'));
  IF (SELECT status FROM shop_orders WHERE id = pg_temp.v('order2')) <> 'collected'
     OR (SELECT refunded_at FROM shop_orders WHERE id = pg_temp.v('order2')) IS NULL
     OR (SELECT stock FROM shop_product_variants WHERE id = pg_temp.v('small')) <> 1 THEN
    RAISE EXCEPTION 'FAIL refund after collection';
  END IF;
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  r := place_shop_order(jsonb_build_array(jsonb_build_object('variant_id', pg_temp.v('small'))));
  PERFORM pg_temp.pay((r->>'order_id')::uuid);
  PERFORM pg_temp.refund((r->>'order_id')::uuid);
  IF (SELECT status FROM shop_orders WHERE id = (r->>'order_id')::uuid) <> 'cancelled'
     OR (SELECT stock FROM shop_product_variants WHERE id = pg_temp.v('small')) <> 1 THEN
    RAISE EXCEPTION 'FAIL refund before collection';
  END IF;
  RAISE NOTICE 'ok  refunds: stock back only if not collected';
END $$;

-- 9. No active class enrolment: the family is told to ask the studio.
UPDATE engagements SET status = 'cancelled' WHERE id = 'f0000000-0000-4000-8000-00000000000b';
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT place_shop_order(%L)', jsonb_build_array(jsonb_build_object('variant_id', pg_temp.v('adult')))),
  'needs_enrolment', 'an order needs an active enrolment');

-- 10. Deleting an ordered item hides it and keeps the picture.
DO $$
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  IF delete_shop_product(pg_temp.v('product')) IS NOT NULL THEN RAISE EXCEPTION 'FAIL picture path returned'; END IF;
  IF (SELECT active FROM shop_products WHERE id = pg_temp.v('product')) THEN RAISE EXCEPTION 'FAIL not hidden'; END IF;
  RAISE NOTICE 'ok  an ordered item is hidden, not deleted';
END $$;
