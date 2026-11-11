-- Photo shop: opt-in flag, prefill, who sees what, pricing, one purchase per photo,
-- and orders following their payment request.
-- Fixture: client-portal seed. Photo studio (…01): admin …0e, Alice …0a (shoot A, account
-- with Ari …0c), Bob …0b (shoot B). Package "Wedding" (e…01).
CREATE TEMP TABLE ids AS SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid AS photo,
  'b0000000-0000-4000-8000-00000000000e'::uuid AS admin,
  'b0000000-0000-4000-8000-00000000000a'::uuid AS alice_u,
  'b0000000-0000-4000-8000-00000000000c'::uuid AS ari_u,
  'b0000000-0000-4000-8000-00000000000b'::uuid AS bob_u,
  'c0000000-0000-4000-8000-00000000000a'::uuid AS alice,
  'c0000000-0000-4000-8000-00000000000c'::uuid AS ari,
  'c0000000-0000-4000-8000-00000000000b'::uuid AS bob,
  'f0000000-0000-4000-8000-00000000000a'::uuid AS shoot_a,
  'f0000000-0000-4000-8000-00000000000b'::uuid AS shoot_b;
GRANT SELECT ON ids TO PUBLIC;

-- Mark a request paid the way the payment pipeline does (a succeeded payment, then the request).
CREATE FUNCTION pg_temp.pay(p_request UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_pay UUID; r job_payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM job_payment_requests WHERE id = p_request;
  INSERT INTO payments (tenant_id, person_id, provider, pretax_amount_minor, total_amount_minor, status, job_payment_request_id)
  SELECT r.tenant_id, e.person_id, 'manual', 0, r.amount_minor, 'succeeded', r.id FROM engagements e WHERE e.id = r.engagement_id
  RETURNING id INTO v_pay;
  UPDATE job_payment_requests SET status = 'paid', payment_id = v_pay, paid_at = now() WHERE id = p_request;
END $$;

CREATE FUNCTION pg_temp.as_user(p_user UUID) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_user::text, false);
$$;

-- Items helper: n photos named k1..kn (or from a start number).
CREATE FUNCTION pg_temp.items(p_from INT, p_to INT) RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_agg(jsonb_build_object('image_key', 'k' || g, 'file_name', 'IMG_' || lpad(g::text, 4, '0') || '.jpg') ORDER BY g)
  FROM generate_series(p_from, p_to) g;
$$;

-- 1. Opt-in flag: never on by plan or profile, only by an override.
DO $$
DECLARE f TEXT[];
BEGIN
  f := get_tenant_features((SELECT photo FROM ids));
  IF 'billing:photo_shop' = ANY(f) THEN RAISE EXCEPTION 'FAIL photo shop on without an override'; END IF;
  UPDATE tenants SET sub_status = 'trialing', trial_ends_at = NULL, payment_flow = 'both' WHERE id = (SELECT photo FROM ids);
  f := get_tenant_features((SELECT photo FROM ids));
  IF 'billing:photo_shop' = ANY(f) THEN RAISE EXCEPTION 'FAIL photo shop on for a trial studio without an override'; END IF;
  INSERT INTO tenant_feature_overrides (tenant_id, feature_key, is_enabled) SELECT photo, 'billing:photo_shop', true FROM ids;
  f := get_tenant_features((SELECT photo FROM ids));
  IF NOT ('billing:photo_shop' = ANY(f)) THEN RAISE EXCEPTION 'FAIL override did not switch the photo shop on'; END IF;
  RAISE NOTICE 'ok  photo shop is opt-in only';
END $$;

-- 2. Prefill from the package and studio defaults; nothing saved yet.
DO $$
DECLARE r JSONB;
BEGIN
  UPDATE offerings SET photos_included = 2 WHERE id = 'e0000000-0000-4000-8000-000000000001';
  INSERT INTO tenant_photo_shop_settings (tenant_id, price_per_photo_minor, all_photos_price_minor, gallery_open_days)
  SELECT photo, 3000, 20000, 30 FROM ids;
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  r := get_job_photo_shop((SELECT shoot_a FROM ids));
  IF (r->>'saved')::bool OR (r->>'included_photos')::int <> 2 OR (r->>'price_per_photo_minor')::int <> 3000
     OR (r->>'all_photos_price_minor')::int <> 20000 OR r->>'currency' <> 'ILS'
     OR (r->>'closes_at')::timestamptz NOT BETWEEN now() + interval '29 days' AND now() + interval '31 days' THEN
    RAISE EXCEPTION 'FAIL prefill wrong: %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM job_photo_shops) THEN RAISE EXCEPTION 'FAIL reading the prefill saved a row'; END IF;
  RAISE NOTICE 'ok  shop prefilled from package (2 included) and studio defaults';
END $$;

-- 3. Only the studio admin can read or save the shop settings.
DO $$
BEGIN
  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  PERFORM get_job_photo_shop((SELECT shoot_a FROM ids));
  RAISE EXCEPTION 'FAIL client read the admin shop settings';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  client cannot read the admin shop settings';
END $$;

DO $$
DECLARE r JSONB;
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  r := save_job_photo_shop((SELECT shoot_a FROM ids),
         '{"gallery_key":"album-A","gallery_name":"Alice proofs","tenant_id":"a0000000-0000-4000-8000-000000000002","currency":"USD"}');
  IF NOT (r->>'saved')::bool OR r->>'gallery_key' <> 'album-A' OR (r->>'included_photos')::int <> 2
     OR r->>'tenant_id' <> (SELECT photo FROM ids)::text OR r->>'currency' <> 'ILS' THEN
    RAISE EXCEPTION 'FAIL save wrong (prefill kept, tenant/currency fixed): %', r;
  END IF;
  -- Explicit null clears the optional bundle price; missing keys keep their value.
  r := save_job_photo_shop((SELECT shoot_a FROM ids), '{"all_photos_price_minor": null}');
  IF r->'all_photos_price_minor' <> 'null'::jsonb OR (r->>'price_per_photo_minor')::int <> 3000 THEN
    RAISE EXCEPTION 'FAIL partial save wrong: %', r;
  END IF;
  r := save_job_photo_shop((SELECT shoot_a FROM ids), '{"all_photos_price_minor": 10000}');
  RAISE NOTICE 'ok  admin saves; prefill kept, tenant and currency cannot be changed';
END $$;

-- 4. Client view: Alice and Ari (same account) see it, Bob does not; no gallery key leaks.
DO $$
DECLARE r JSONB;
BEGIN
  PERFORM pg_temp.as_user((SELECT ari_u FROM ids));
  r := get_client_photo_shop((SELECT shoot_a FROM ids));
  IF NOT (r->>'open')::bool OR (r->>'included_left')::int <> 2 OR r ? 'gallery_key' OR r::text LIKE '%album-A%' THEN
    RAISE EXCEPTION 'FAIL client view wrong: %', r;
  END IF;
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  PERFORM get_client_photo_shop((SELECT shoot_a FROM ids));
  RAISE EXCEPTION 'FAIL another client read the shop';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  shoot''s account sees the shop, without the gallery key; another client cannot';
END $$;

-- Clients cannot read the tables directly.
SET ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-00000000000a', false);
  IF EXISTS (SELECT 1 FROM job_photo_shops) OR EXISTS (SELECT 1 FROM job_photo_orders) THEN
    RAISE EXCEPTION 'FAIL client read photo shop tables directly';
  END IF;
  RAISE NOTICE 'ok  client cannot read shop or order tables directly';
END $$;
RESET ROLE;

-- 5. Order: 3 photos, 2 included → 1 × 30.00. Payment request created for 30.00.
DO $$
DECLARE r JSONB; amt INT;
BEGIN
  r := create_job_photo_order((SELECT shoot_a FROM ids), (SELECT alice FROM ids), pg_temp.items(1, 3), false, 'Photos (3)');
  IF r->>'status' <> 'awaiting_payment' OR (r->>'included_count')::int <> 2 OR (r->>'total_minor')::int <> 3000
     OR r->>'pay_token' IS NULL THEN
    RAISE EXCEPTION 'FAIL order wrong: %', r;
  END IF;
  SELECT amount_minor INTO amt FROM job_payment_requests WHERE id = (r->>'job_payment_request_id')::uuid;
  IF amt <> 3000 THEN RAISE EXCEPTION 'FAIL request amount %', amt; END IF;
  IF (SELECT count(*) FROM job_photo_order_items WHERE order_id = (r->>'order_id')::uuid AND included) <> 2 THEN
    RAISE EXCEPTION 'FAIL included lines';
  END IF;
  RAISE NOTICE 'ok  3 photos with 2 included = one paid photo, payment request for it';
END $$;

-- 6. Bob cannot order on Alice's shoot; Ari (same account) can.
DO $$
BEGIN
  PERFORM create_job_photo_order((SELECT shoot_a FROM ids), (SELECT bob FROM ids), pg_temp.items(9, 9));
  RAISE EXCEPTION 'FAIL another client ordered';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  another client cannot order on this shoot';
END $$;

-- 7. A photo in someone's live order cannot be bought again.
DO $$
BEGIN
  PERFORM create_job_photo_order((SELECT shoot_a FROM ids), (SELECT ari FROM ids), pg_temp.items(3, 4));
  RAISE EXCEPTION 'FAIL photo bought twice';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%already_bought k3%' THEN RAISE; END IF;
  RAISE NOTICE 'ok  a photo already in an order cannot be bought twice';
END $$;

-- 8. A new cart replaces the same person's unpaid order: old request cancelled, photos freed.
DO $$
DECLARE r JSONB; old_req UUID; st TEXT;
BEGIN
  SELECT job_payment_request_id INTO old_req FROM job_photo_orders WHERE status = 'awaiting_payment' AND person_id = (SELECT alice FROM ids);
  r := create_job_photo_order((SELECT shoot_a FROM ids), (SELECT alice FROM ids), pg_temp.items(1, 4), false, 'Photos (4)');
  SELECT status INTO st FROM job_payment_requests WHERE id = old_req;
  IF st <> 'cancelled' THEN RAISE EXCEPTION 'FAIL old request is %', st; END IF;
  IF (r->>'included_count')::int <> 2 OR (r->>'total_minor')::int <> 6000 THEN RAISE EXCEPTION 'FAIL new cart: %', r; END IF;
  IF (SELECT count(*) FROM job_photo_orders WHERE status = 'cancelled') <> 1 THEN RAISE EXCEPTION 'FAIL old order not cancelled'; END IF;
  -- The cancelled request cannot be reopened.
  BEGIN
    UPDATE job_payment_requests SET status = 'pending' WHERE id = old_req;
    RAISE EXCEPTION 'FAIL reopened a cancelled photo order';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%cannot be reopened%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  new cart replaces the unpaid one; its request is cancelled and cannot be reopened';
END $$;

-- 9. Pay → order paid; client sees the photos as bought. Deliver needs https; then the link shows.
DO $$
DECLARE o job_photo_orders%ROWTYPE; r JSONB;
BEGIN
  SELECT * INTO o FROM job_photo_orders WHERE status = 'awaiting_payment';
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  BEGIN
    PERFORM deliver_job_photo_order(o.id, 'https://example.test/dl');
    RAISE EXCEPTION 'FAIL delivered before payment';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%order is awaiting_payment%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.pay(o.job_payment_request_id);
  SELECT * INTO o FROM job_photo_orders WHERE id = o.id;
  IF o.status <> 'paid' OR o.paid_at IS NULL THEN RAISE EXCEPTION 'FAIL order not paid: %', o.status; END IF;

  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  r := get_client_photo_shop((SELECT shoot_a FROM ids));
  IF jsonb_array_length(r->'bought_image_keys') <> 4 OR (r->>'included_left')::int <> 0
     OR r->'orders'->0->>'delivery_url' IS NOT NULL OR r->'orders'->0->>'pay_token' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL client view after payment: %', r;
  END IF;
  BEGIN
    PERFORM deliver_job_photo_order(o.id, 'https://example.test/dl');
    RAISE EXCEPTION 'FAIL client delivered';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  BEGIN
    PERFORM deliver_job_photo_order(o.id, 'javascript:alert(1)');
    RAISE EXCEPTION 'FAIL accepted a non-https link';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%https%' THEN RAISE; END IF;
  END;

  -- "Mark as sent" (photos sent another way): only the admin, only a paid order, no link.
  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  BEGIN
    PERFORM mark_job_photo_order_sent(o.id);
    RAISE EXCEPTION 'FAIL client marked sent';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  PERFORM mark_job_photo_order_sent(o.id);
  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  r := get_client_photo_shop((SELECT shoot_a FROM ids));
  IF r->'orders'->0->>'status' <> 'delivered' OR r->'orders'->0->>'delivery_url' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL marked sent: %', r;
  END IF;
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  BEGIN
    PERFORM mark_job_photo_order_sent(o.id);
    RAISE EXCEPTION 'FAIL marked sent twice';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%order is delivered%' THEN RAISE; END IF;
  END;
  -- A link can still be sent afterwards.
  PERFORM deliver_job_photo_order(o.id, 'https://studio.smugmug.test/Alice-download');

  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  r := get_client_photo_shop((SELECT shoot_a FROM ids));
  IF r->'orders'->0->>'delivery_url' <> 'https://studio.smugmug.test/Alice-download' OR r->'orders'->0->>'status' <> 'delivered' THEN
    RAISE EXCEPTION 'FAIL client does not see the delivery: %', r;
  END IF;
  RAISE NOTICE 'ok  paid → bought; only the admin delivers or marks sent, https only; client then sees the link';
END $$;

-- 10. Refund after delivery: refunded, photos stay bought. Before delivery: cancelled, photos freed.
DO $$
DECLARE o job_photo_orders%ROWTYPE; r JSONB;
BEGIN
  SELECT * INTO o FROM job_photo_orders WHERE status = 'delivered';
  UPDATE job_payment_requests SET status = 'refunded_manual', refunded_at = now() WHERE id = o.job_payment_request_id;
  SELECT * INTO o FROM job_photo_orders WHERE id = o.id;
  IF o.status <> 'refunded' OR EXISTS (SELECT 1 FROM job_photo_order_items WHERE order_id = o.id AND voided_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL refund after delivery: %', o.status;
  END IF;

  r := create_job_photo_order((SELECT shoot_a FROM ids), (SELECT ari FROM ids), pg_temp.items(5, 6));
  IF (r->>'included_count')::int <> 0 OR (r->>'total_minor')::int <> 6000 THEN RAISE EXCEPTION 'FAIL second order: %', r; END IF;
  PERFORM pg_temp.pay((r->>'job_payment_request_id')::uuid);
  UPDATE job_payment_requests SET status = 'refunded_manual', refunded_at = now() WHERE id = (r->>'job_payment_request_id')::uuid;
  SELECT * INTO o FROM job_photo_orders WHERE id = (r->>'order_id')::uuid;
  IF o.status <> 'cancelled' OR o.refunded_at IS NULL
     OR EXISTS (SELECT 1 FROM job_photo_order_items WHERE order_id = o.id AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL refund before delivery: %', o.status;
  END IF;
  RAISE NOTICE 'ok  refund after delivery keeps the photos bought; before delivery it cancels and frees them';
END $$;

-- 11. "All photos": capped by the bundle minus what was spent, and never above one-by-one.
DO $$
DECLARE r JSONB;
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  PERFORM save_job_photo_shop((SELECT shoot_b FROM ids), '{"gallery_key":"album-B","included_photos":0}');
  -- Money kept so far: none (the only paid order was refunded). 10 more photos one by one = 30000,
  -- bundle 10000 → 10000.
  r := create_job_photo_order((SELECT shoot_a FROM ids), (SELECT alice FROM ids), pg_temp.items(5, 14), true);
  IF (r->>'total_minor')::int <> 10000 THEN RAISE EXCEPTION 'FAIL bundle total: %', r; END IF;
  IF (SELECT sum(price_minor) FROM job_photo_order_items WHERE order_id = (r->>'order_id')::uuid) <> 10000 THEN
    RAISE EXCEPTION 'FAIL bundle lines do not add up';
  END IF;
  -- Paid: a later "all photos" order is capped by what is left of the bundle (0 here).
  PERFORM pg_temp.pay((r->>'job_payment_request_id')::uuid);
  r := create_job_photo_order((SELECT shoot_a FROM ids), (SELECT alice FROM ids), pg_temp.items(15, 16), true);
  IF (r->>'total_minor')::int <> 0 OR r->>'status' <> 'paid' THEN RAISE EXCEPTION 'FAIL bundle balance: %', r; END IF;
  -- One photo would be cheaper alone (3000) than a fresh bundle (10000).
  r := create_job_photo_order((SELECT shoot_b FROM ids), (SELECT bob FROM ids), pg_temp.items(1, 1), true);
  IF (r->>'total_minor')::int <> 3000 THEN RAISE EXCEPTION 'FAIL bundle should not cost more than one by one: %', r; END IF;
  UPDATE job_payment_requests SET status = 'cancelled' WHERE id = (r->>'job_payment_request_id')::uuid;
  RAISE NOTICE 'ok  "all photos" capped by the bundle balance and by the one-by-one price';
END $$;

-- 12. Fully included order is free and paid at once, with no payment request.
DO $$
DECLARE r JSONB;
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  PERFORM save_job_photo_shop((SELECT shoot_b FROM ids), '{"included_photos":2,"price_per_photo_minor":null}');
  r := create_job_photo_order((SELECT shoot_b FROM ids), (SELECT bob FROM ids), pg_temp.items(1, 2));
  IF r->>'status' <> 'paid' OR (r->>'total_minor')::int <> 0 OR r->>'job_payment_request_id' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL free order: %', r;
  END IF;
  -- With no price per photo, extras cannot be priced.
  BEGIN
    PERFORM create_job_photo_order((SELECT shoot_b FROM ids), (SELECT bob FROM ids), pg_temp.items(3, 3));
    RAISE EXCEPTION 'FAIL priced an extra with no price';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%no_price%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  included-only order is free and paid; extras need a price';
END $$;

-- 13. Closed shop: no new orders, but the client still sees what they bought.
DO $$
DECLARE r JSONB;
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  PERFORM save_job_photo_shop((SELECT shoot_b FROM ids), jsonb_build_object('closes_at', now() - interval '1 minute'));
  BEGIN
    PERFORM create_job_photo_order((SELECT shoot_b FROM ids), (SELECT bob FROM ids), pg_temp.items(4, 4));
    RAISE EXCEPTION 'FAIL ordered from a closed shop';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%shop_closed%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  r := get_client_photo_shop((SELECT shoot_b FROM ids));
  IF (r->>'open')::bool OR jsonb_array_length(r->'bought_image_keys') <> 2 THEN RAISE EXCEPTION 'FAIL closed view: %', r; END IF;
  RAISE NOTICE 'ok  closed shop takes no orders; bought photos still listed';
END $$;

-- 14. Pay in cash: the order is sent in and waits for payment; the client's next card cart
--     doesn't replace it; its photos aren't pickable again; recording the cash makes it paid.
DO $$
DECLARE r JSONB; c JSONB; v JSONB; v_cash UUID;
BEGIN
  r := create_job_photo_order((SELECT shoot_a FROM ids), (SELECT alice FROM ids), pg_temp.items(40, 41), false, 'Photos (2)', true);
  v_cash := (r->>'order_id')::uuid;
  IF r->>'status' <> 'awaiting_payment' OR NOT (r->>'pay_by_cash')::bool OR r->>'pay_token' IS NULL THEN
    RAISE EXCEPTION 'FAIL cash order: %', r;
  END IF;
  c := create_job_photo_order((SELECT shoot_a FROM ids), (SELECT alice FROM ids), pg_temp.items(42, 42));
  IF (SELECT status FROM job_photo_orders WHERE id = v_cash) <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'FAIL the next card cart replaced the cash order';
  END IF;
  PERFORM pg_temp.as_user((SELECT alice_u FROM ids));
  v := get_client_photo_shop((SELECT shoot_a FROM ids));
  IF NOT (v->'cash_image_keys' @> '["k40","k41"]'::jsonb) OR v->'cash_image_keys' @> '["k42"]'::jsonb THEN
    RAISE EXCEPTION 'FAIL cash photos: %', v->'cash_image_keys';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'orders') o WHERE o->>'id' = v_cash::text AND (o->>'pay_by_cash')::bool) THEN
    RAISE EXCEPTION 'FAIL cash order not marked in the client view';
  END IF;
  -- A second card cart still replaces the first card cart, never the cash order.
  PERFORM create_job_photo_order((SELECT shoot_a FROM ids), (SELECT alice FROM ids), pg_temp.items(43, 43));
  IF (SELECT status FROM job_photo_orders WHERE id = (c->>'order_id')::uuid) <> 'cancelled'
     OR (SELECT status FROM job_photo_orders WHERE id = v_cash) <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'FAIL replace rules';
  END IF;
  PERFORM pg_temp.pay((r->>'job_payment_request_id')::uuid);
  IF (SELECT status FROM job_photo_orders WHERE id = v_cash) <> 'paid' THEN RAISE EXCEPTION 'FAIL cash recorded but not paid'; END IF;
  RAISE NOTICE 'ok  pay in cash: kept, photos taken, paid once the cash is recorded';
END $$;
