-- =============================================================================
-- 20261122192657: Studio shop (beta), guest checkout. Anyone visiting the
-- studio's public Shop page can buy, not only families with a child in a class
-- (owner, 22 Nov 2026). Owner's choices: collect at the studio only; pay by card
-- or "Pay the studio directly (cash, bank transfer or other)"; an unpaid card
-- order holds its stock for 48 hours.
--
-- How a guest order is paid. Payment requests (job_payment_requests) and every
-- payment callback need an engagement, and live card payments must not change.
-- So each studio gets one hidden "shop" offering (offering_type 'shop'), and a
-- buyer gets one hidden engagement on it (status 'shop'). The order's payment
-- request hangs off that engagement, exactly as a family order hangs off a class
-- enrolment: pay page, card callbacks, receipts, record-job-payment (cash),
-- refunds and Finance are unchanged.
--
-- Keeping the hidden records out of sight (one place each, not query by query):
--   * offering_type 'shop' is not 'class' or 'appointment', and engagement status
--     'shop' is not any status the app treats as enrolled, booked or waiting.
--   * RESTRICTIVE row policies hide them from every app and portal query.
--   * Every database function that lists or counts enrolments, bookings or
--     shoots already filters on those statuses or types (or on job_details,
--     which a shop engagement never has), so none needed changing.
--     apps/web/src/__tests__/shop-hidden-records-guard.test.ts lists every
--     offering and engagement query so a new one is reviewed.
--
-- Also: shop_orders keeps the buyer's contact details and how they pay;
-- release_stale_shop_orders() gives back the stock of card orders unpaid after
-- 48 hours (called every minute by expire-scheduling-holds).
--
-- ADDITIVE MIGRATION: widened CHECKs, new columns, new policies and functions;
-- place_shop_order and get_studio_shop_orders are replaced with the same
-- signatures.
-- DEPENDENCIES: 20261111150000 (shop orders), 20261122190641 (public catalogue).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The hidden shop offering and engagements
-- ---------------------------------------------------------------------------
ALTER TABLE offerings DROP CONSTRAINT offerings_offering_type_check;
ALTER TABLE offerings ADD CONSTRAINT offerings_offering_type_check
  CHECK (offering_type IN ('class', 'appointment', 'shop'));
ALTER TABLE offerings DROP CONSTRAINT offerings_type_shape;
ALTER TABLE offerings ADD CONSTRAINT offerings_type_shape CHECK (
  (offering_type = 'class' AND start_time IS NOT NULL AND end_time IS NOT NULL)
  OR (offering_type = 'appointment' AND duration_mins IS NOT NULL AND day_of_week IS NULL
      AND start_time IS NULL AND end_time IS NULL)
  OR (offering_type = 'shop' AND day_of_week IS NULL AND start_time IS NULL AND end_time IS NULL
      AND NOT is_public)
);
COMMENT ON COLUMN offerings.offering_type IS
  'class | appointment | shop. shop = the studio''s one hidden record that guest shop orders are paid through; never shown.';
CREATE UNIQUE INDEX uq_offerings_one_shop_per_tenant ON offerings(tenant_id) WHERE offering_type = 'shop';

ALTER TABLE engagements DROP CONSTRAINT engagements_status_check;
ALTER TABLE engagements ADD CONSTRAINT engagements_status_check
  CHECK (status IN ('pending_payment', 'active', 'admin_review', 'pending_offer', 'cancelled',
                    'withdrawn', 'pending_waiver', 'shop'));

-- Every app and portal read skips them. Super admins too: nothing in the app
-- should show them. Server code (service role, definer functions) still sees them.
CREATE POLICY offerings_hide_shop ON offerings AS RESTRICTIVE FOR ALL
  USING (offering_type <> 'shop') WITH CHECK (offering_type <> 'shop');
CREATE POLICY engagements_hide_shop ON engagements AS RESTRICTIVE FOR ALL
  USING (status <> 'shop') WITH CHECK (status <> 'shop');

-- The studio's shop offering, made the first time it is needed.
CREATE OR REPLACE FUNCTION private.shop_offering_id(p_tenant_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM offerings WHERE tenant_id = p_tenant_id AND offering_type = 'shop';
  IF v_id IS NULL THEN
    INSERT INTO offerings (tenant_id, name, offering_type, is_public, delivery_mode, billing_mode,
                           waiver_required, price_minor, max_capacity)
    VALUES (p_tenant_id, 'Shop', 'shop', false, 'intangible', 'one_time', false, 0, 1)
    ON CONFLICT (tenant_id) WHERE offering_type = 'shop' DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM offerings WHERE tenant_id = p_tenant_id AND offering_type = 'shop';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.shop_offering_id(UUID) FROM PUBLIC, anon, authenticated;

-- A buyer's hidden shop engagement (one per person), made the first time.
CREATE OR REPLACE FUNCTION private.shop_engagement_id(p_tenant_id UUID, p_person_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_offering UUID := private.shop_offering_id(p_tenant_id);
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM engagements
   WHERE tenant_id = p_tenant_id AND person_id = p_person_id AND offering_id = v_offering AND status = 'shop'
   LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO engagements (tenant_id, person_id, offering_id, status)
    VALUES (p_tenant_id, p_person_id, v_offering, 'shop')
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.shop_engagement_id(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Orders: buyer's contact details and how they pay
-- ---------------------------------------------------------------------------
ALTER TABLE shop_orders
  ADD COLUMN pay_by_cash   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN guest         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN contact_name  TEXT CHECK (contact_name IS NULL OR length(contact_name) <= 200),
  ADD COLUMN contact_email TEXT CHECK (contact_email IS NULL OR length(contact_email) <= 320),
  ADD COLUMN contact_phone TEXT CHECK (contact_phone IS NULL OR length(contact_phone) <= 40);
COMMENT ON COLUMN shop_orders.pay_by_cash IS
  'The buyer pays the studio directly (cash, bank transfer or other); the studio records it. Not released after 48 hours.';
COMMENT ON COLUMN shop_orders.guest IS
  'Placed on the public Shop page (paid through the hidden shop engagement), not in the family page.';
COMMENT ON COLUMN shop_orders.contact_phone IS
  'Public Shop page orders: the phone the buyer gave, so the studio can reach them about collection.';

-- ---------------------------------------------------------------------------
-- The cart → order core, shared by the family page and the public Shop page.
-- Prices come from the items, never from the request. Holds stock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.shop_order_create(
  p_tenant_id UUID, p_person_id UUID, p_ordered_by UUID, p_engagement_id UUID, p_lines JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id   UUID;
  v_total      BIGINT := 0;
  v_currency   TEXT;
  v_line       JSONB;
  v_qty        INT;
  v_variant    shop_product_variants%ROWTYPE;
  v_product    shop_products%ROWTYPE;
  v_n          INT := 0;
  v_label      TEXT;
  v_token      TEXT;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'place_shop_order: empty_cart';
  END IF;
  IF jsonb_array_length(p_lines) > 50 THEN
    RAISE EXCEPTION 'place_shop_order: too_many_items';
  END IF;

  INSERT INTO shop_orders (tenant_id, person_id, ordered_by, engagement_id, total_minor, currency)
  VALUES (p_tenant_id, p_person_id, p_ordered_by, p_engagement_id, 1, 'ILS')
  RETURNING id INTO v_order_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_n := v_n + 1;
    BEGIN
      v_qty := COALESCE((v_line->>'quantity')::INT, 1);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'place_shop_order: bad_quantity';
    END;
    IF v_qty < 1 OR v_qty > 20 THEN
      RAISE EXCEPTION 'place_shop_order: bad_quantity';
    END IF;
    BEGIN
      SELECT * INTO v_variant FROM shop_product_variants
       WHERE id = (v_line->>'variant_id')::UUID AND tenant_id = p_tenant_id FOR UPDATE;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'place_shop_order: item_not_found';
    END;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'place_shop_order: item_not_found';
    END IF;
    SELECT * INTO v_product FROM shop_products WHERE id = v_variant.product_id;
    IF NOT v_product.active THEN
      RAISE EXCEPTION 'place_shop_order: item_not_found';
    END IF;
    IF v_variant.stock IS NOT NULL THEN
      IF v_variant.stock < v_qty THEN
        RAISE EXCEPTION 'place_shop_order: sold_out %', v_variant.id;
      END IF;
      UPDATE shop_product_variants SET stock = stock - v_qty WHERE id = v_variant.id;
    END IF;
    IF v_currency IS NULL THEN
      v_currency := v_product.currency;
    ELSIF v_currency <> v_product.currency THEN
      RAISE EXCEPTION 'place_shop_order: mixed_currency';
    END IF;
    INSERT INTO shop_order_lines (order_id, tenant_id, product_id, variant_id, product_name, variant_label,
                                  unit_price_minor, quantity, position)
    VALUES (v_order_id, p_tenant_id, v_product.id, v_variant.id, v_product.name, v_variant.label,
            v_product.price_minor, v_qty, v_n);
    v_total := v_total + v_product.price_minor::BIGINT * v_qty;
  END LOOP;
  IF v_total > 2147483647 THEN
    RAISE EXCEPTION 'place_shop_order: total_too_large';
  END IF;

  UPDATE shop_orders SET total_minor = v_total::INT, currency = v_currency WHERE id = v_order_id;

  -- "Black leotard (Age 4-6) ×2, Tights (One size)" — what the pay page and receipts show.
  SELECT left(string_agg(product_name
                || CASE WHEN variant_label <> 'One size' THEN ' (' || variant_label || ')' ELSE '' END
                || CASE WHEN quantity > 1 THEN ' ×' || quantity ELSE '' END, ', ' ORDER BY position), 120)
    INTO v_label FROM shop_order_lines WHERE order_id = v_order_id;

  INSERT INTO job_payment_requests (tenant_id, engagement_id, label, amount_minor, currency, max_installments, shop_order_id)
  VALUES (p_tenant_id, p_engagement_id, v_label, v_total::INT, v_currency, 1, v_order_id)
  RETURNING public_token INTO v_token;

  RETURN jsonb_build_object('order_id', v_order_id, 'status', 'awaiting_payment',
                            'total_minor', v_total, 'currency', v_currency, 'pay_token', v_token);
END;
$$;
REVOKE EXECUTE ON FUNCTION private.shop_order_create(UUID, UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- Families (signed in): unchanged behaviour, now on the shared core.
CREATE OR REPLACE FUNCTION place_shop_order(p_lines JSONB, p_person_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id  UUID := get_my_tenant_id();
  v_me         UUID := get_my_person_id();
  v_person     people%ROWTYPE;
  v_engagement UUID;
  v_result     JSONB;
BEGIN
  IF v_tenant_id IS NULL OR v_me IS NULL THEN
    RAISE EXCEPTION 'place_shop_order: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT private.studio_shop_enabled(v_tenant_id) THEN
    RAISE EXCEPTION 'place_shop_order: switched_off';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'place_shop_order: empty_cart';
  END IF;

  SELECT * INTO v_person FROM people WHERE id = COALESCE(p_person_id, v_me) AND tenant_id = v_tenant_id;
  IF NOT FOUND OR NOT (
       v_person.id = v_me
       OR (v_person.account_id IS NOT NULL AND v_person.account_id IN (SELECT get_my_account_ids()))) THEN
    RAISE EXCEPTION 'place_shop_order: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Payment requests need an engagement: the person's active enrolment, else the family's.
  SELECT e.id INTO v_engagement
    FROM engagements e JOIN people p ON p.id = e.person_id
   WHERE e.tenant_id = v_tenant_id AND e.status = 'active'
     AND (e.person_id = v_person.id OR (v_person.account_id IS NOT NULL AND p.account_id = v_person.account_id))
   ORDER BY (e.person_id = v_person.id) DESC, e.created_at DESC
   LIMIT 1;
  IF v_engagement IS NULL THEN
    RAISE EXCEPTION 'place_shop_order: needs_enrolment';
  END IF;

  v_result := private.shop_order_create(v_tenant_id, v_person.id, v_me, v_engagement, p_lines);

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_tenant_id, auth.uid(), 'shop_order.placed', 'shop_order', (v_result->>'order_id')::UUID,
          jsonb_build_object('person_id', v_person.id, 'total_minor', v_result->'total_minor',
                             'lines', jsonb_array_length(p_lines)));
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION place_shop_order(JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION place_shop_order(JSONB, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Public Shop page: anyone places an order. Server only (studio-shop-checkout
-- checks the studio, the spam guard and the details first).
--   The buyer is the studio's client with this email, or a new client.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION place_guest_shop_order(
  p_tenant_id UUID, p_name TEXT, p_email TEXT, p_phone TEXT, p_lines JSONB, p_pay_by_cash BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name   TEXT := left(btrim(COALESCE(p_name, '')), 200);
  v_email  TEXT := lower(btrim(COALESCE(p_email, '')));
  v_phone  TEXT := NULLIF(left(btrim(COALESCE(p_phone, '')), 40), '');
  v_person UUID;
  v_result JSONB;
  v_order  UUID;
BEGIN
  IF p_tenant_id IS NULL OR NOT private.studio_shop_enabled(p_tenant_id) THEN
    RAISE EXCEPTION 'place_shop_order: switched_off';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'place_shop_order: name_required';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 320 THEN
    RAISE EXCEPTION 'place_shop_order: email_required';
  END IF;

  SELECT id INTO v_person FROM people WHERE tenant_id = p_tenant_id AND lower(email) = v_email
   ORDER BY created_at LIMIT 1;
  IF v_person IS NULL THEN
    INSERT INTO people (tenant_id, name, email, status)
    VALUES (p_tenant_id, v_name, v_email, 'active')
    RETURNING id INTO v_person;
  END IF;

  v_result := private.shop_order_create(p_tenant_id, v_person, NULL,
                                        private.shop_engagement_id(p_tenant_id, v_person), p_lines);
  v_order := (v_result->>'order_id')::UUID;
  UPDATE shop_orders
     SET guest = true, pay_by_cash = COALESCE(p_pay_by_cash, false),
         contact_name = v_name, contact_email = v_email, contact_phone = v_phone
   WHERE id = v_order;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (p_tenant_id, NULL, 'shop_order.placed', 'shop_order', v_order,
          jsonb_build_object('person_id', v_person, 'total_minor', v_result->'total_minor',
                             'lines', jsonb_array_length(p_lines), 'guest', true,
                             'pay_by_cash', COALESCE(p_pay_by_cash, false)));
  RETURN v_result || jsonb_build_object('person_id', v_person, 'pay_by_cash', COALESCE(p_pay_by_cash, false));
END;
$$;
REVOKE ALL ON FUNCTION place_guest_shop_order(UUID, TEXT, TEXT, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION place_guest_shop_order(UUID, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO service_role;

-- ---------------------------------------------------------------------------
-- Unpaid card orders give their stock back after 48 hours (owner's choice).
-- "Pay the studio directly" orders wait until the studio cancels them.
-- Returns how many orders were released. Server only (cron).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION release_stale_shop_orders()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order shop_orders%ROWTYPE;
  v_n INT := 0;
BEGIN
  FOR v_order IN
    SELECT * FROM shop_orders
     WHERE status = 'awaiting_payment' AND NOT pay_by_cash AND holds_stock
       AND created_at < now() - interval '48 hours'
     ORDER BY created_at
     LIMIT 500
     FOR UPDATE SKIP LOCKED
  LOOP
    -- Cancelling the request cancels the order and gives the stock back (trigger).
    UPDATE job_payment_requests SET status = 'cancelled'
     WHERE shop_order_id = v_order.id AND status IN ('pending', 'sent');
    UPDATE shop_orders SET status = 'cancelled', cancelled_at = now()
     WHERE id = v_order.id AND status = 'awaiting_payment';
    PERFORM private.shop_order_release_stock(v_order.id);
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
    VALUES (v_order.tenant_id, NULL, 'shop_order.released', 'shop_order', v_order.id,
            jsonb_build_object('reason', 'unpaid_48h'));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION release_stale_shop_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION release_stale_shop_orders() TO service_role;

-- ---------------------------------------------------------------------------
-- Studio: orders now show how the buyer pays, their details (public Shop page
-- orders), and the request to record a direct payment against.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_studio_shop_orders()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id UUID := get_my_tenant_id();
BEGIN
  IF v_tenant_id IS NULL OR NOT photo_shop_is_admin(v_tenant_id) THEN
    RAISE EXCEPTION 'get_studio_shop_orders: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', o.id, 'person_id', o.person_id, 'person_name', p.name,
             'ordered_by_name', ob.name, 'status', o.status,
             'total_minor', o.total_minor, 'currency', o.currency, 'created_at', o.created_at,
             'paid_at', o.paid_at, 'ready_at', o.ready_at, 'collected_at', o.collected_at,
             'cancelled_at', o.cancelled_at, 'refunded', o.refunded_at IS NOT NULL,
             'pay_by_cash', o.pay_by_cash, 'guest', o.guest,
             'contact_email', COALESCE(o.contact_email, p.email), 'contact_phone', o.contact_phone,
             'request_id', (SELECT r.id FROM job_payment_requests r
                             WHERE r.shop_order_id = o.id AND r.status IN ('pending', 'sent') LIMIT 1),
             'lines', private.shop_order_lines_json(o.id))
             ORDER BY o.created_at DESC), '[]'::jsonb)
      FROM shop_orders o
      JOIN people p ON p.id = o.person_id
      LEFT JOIN people ob ON ob.id = o.ordered_by
     WHERE o.tenant_id = v_tenant_id
       AND (o.status <> 'cancelled' OR o.cancelled_at > now() - interval '30 days')
  );
END;
$$;
REVOKE ALL ON FUNCTION get_studio_shop_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_studio_shop_orders() TO authenticated;
