-- =============================================================================
-- 20261111160000: Photo shop: "Pay in cash". The client can send in a photo order
-- and pay the studio in cash instead of paying by card first. The order waits for
-- payment (its payment request stays open, so the client can still pay online);
-- the studio records the cash on the order ("Record cash payment", the usual
-- record-job-payment), and the order then counts as paid. Nothing blocks the order.
--
--   * job_photo_orders.pay_by_cash.
--   * create_job_photo_order(..., p_pay_by_cash): a cash order is not replaced by
--     the client's next cart (card carts still replace each other).
--   * get_client_photo_shop: orders carry pay_by_cash; cash_image_keys lists the
--     photos already sent in to be paid in cash (not pickable again).
--
-- ADDITIVE MIGRATION: one column; two functions replaced (one gains a parameter).
-- =============================================================================

ALTER TABLE job_photo_orders ADD COLUMN pay_by_cash BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN job_photo_orders.pay_by_cash IS
  'The client sent the order in to pay the studio in cash. It waits for payment until the studio records it.';

DROP FUNCTION IF EXISTS create_job_photo_order(UUID, UUID, JSONB, BOOLEAN, TEXT);
CREATE OR REPLACE FUNCTION create_job_photo_order(
  p_engagement_id UUID,
  p_person_id     UUID,
  p_items         JSONB,
  p_all_photos    BOOLEAN DEFAULT false,
  p_label         TEXT    DEFAULT 'Photos',
  p_pay_by_cash   BOOLEAN DEFAULT false
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop          job_photo_shops%ROWTYPE;
  v_count         INT;
  v_used_free     INT;
  v_free          INT;
  v_paid_before   BIGINT;
  v_total         BIGINT;
  v_order_id      UUID;
  v_request_id    UUID;
  v_token         TEXT;
  v_item          JSONB;
  v_n             INT := 0;
BEGIN
  SELECT * INTO v_shop FROM job_photo_shops WHERE engagement_id = p_engagement_id FOR UPDATE;
  IF NOT FOUND OR v_shop.gallery_key IS NULL THEN
    RAISE EXCEPTION 'create_job_photo_order: shop_not_open';
  END IF;
  IF v_shop.closes_at <= now() THEN
    RAISE EXCEPTION 'create_job_photo_order: shop_closed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM engagements e
    JOIN people p ON p.id = p_person_id AND p.tenant_id = e.tenant_id
    WHERE e.id = p_engagement_id
      AND (e.person_id = p_person_id
           OR (p.account_id IS NOT NULL AND e.person_id IN (SELECT id FROM people WHERE account_id = p.account_id)))
  ) THEN
    RAISE EXCEPTION 'create_job_photo_order: not_this_client' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'create_job_photo_order: no_photos';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count > 10000 THEN
    RAISE EXCEPTION 'create_job_photo_order: too_many_photos';
  END IF;

  -- The cart replaces this person's earlier unpaid card orders for the shoot. An order
  -- sent in to be paid in cash is kept: the studio may already be preparing it.
  UPDATE job_payment_requests r SET status = 'cancelled'
  FROM job_photo_orders o
  WHERE o.engagement_id = p_engagement_id AND o.person_id = p_person_id
    AND o.status = 'awaiting_payment' AND NOT o.pay_by_cash AND r.id = o.job_payment_request_id
    AND r.status IN ('pending', 'sent');
  -- (The trigger cancels those orders; an unpaid order with no request is free and never waits.)

  -- Free photos already used (any live order) and money kept so far (paid or
  -- delivered; refunded money does not count towards the "all photos" price).
  SELECT COALESCE(SUM(CASE WHEN i.included THEN 1 ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN o.status IN ('paid', 'delivered') THEN i.price_minor ELSE 0 END), 0)
    INTO v_used_free, v_paid_before
  FROM job_photo_order_items i
  JOIN job_photo_orders o ON o.id = i.order_id
  WHERE i.engagement_id = p_engagement_id AND i.voided_at IS NULL;

  v_free := LEAST(v_count, GREATEST(0, v_shop.included_photos - v_used_free));

  IF p_all_photos THEN
    IF v_shop.all_photos_price_minor IS NULL THEN
      RAISE EXCEPTION 'create_job_photo_order: no_all_photos_price';
    END IF;
    -- Never more than the "all photos" price in total for the shoot, and
    -- never more than the same photos would cost one by one.
    v_total := GREATEST(0, v_shop.all_photos_price_minor - v_paid_before);
    IF v_shop.price_per_photo_minor IS NOT NULL THEN
      v_total := LEAST(v_total, (v_count - v_free)::BIGINT * v_shop.price_per_photo_minor);
    END IF;
    IF v_count = v_free THEN
      v_total := 0;
    END IF;
  ELSE
    IF v_count > v_free AND v_shop.price_per_photo_minor IS NULL THEN
      RAISE EXCEPTION 'create_job_photo_order: no_price';
    END IF;
    v_total := (v_count - v_free)::BIGINT * COALESCE(v_shop.price_per_photo_minor, 0);
  END IF;
  IF v_total > 2147483647 THEN
    RAISE EXCEPTION 'create_job_photo_order: total_too_large';
  END IF;

  IF v_total > 0 THEN
    INSERT INTO job_payment_requests (tenant_id, engagement_id, label, amount_minor, currency, max_installments)
    VALUES (v_shop.tenant_id, p_engagement_id,
            left(COALESCE(NULLIF(trim(p_label), ''), 'Photos'), 120), v_total::INT, v_shop.currency, 1)
    RETURNING id, public_token INTO v_request_id, v_token;
  END IF;

  INSERT INTO job_photo_orders (
    tenant_id, engagement_id, person_id, status, all_photos, photo_count, included_count,
    total_minor, currency, paid_at, job_payment_request_id, pay_by_cash
  ) VALUES (
    v_shop.tenant_id, p_engagement_id, p_person_id,
    CASE WHEN v_total = 0 THEN 'paid' ELSE 'awaiting_payment' END,
    p_all_photos, v_count, v_free, v_total::INT, v_shop.currency,
    CASE WHEN v_total = 0 THEN now() END, v_request_id, COALESCE(p_pay_by_cash, false) AND v_total > 0
  )
  RETURNING id INTO v_order_id;

  -- Free photos first, then paid; with "all photos" the price sits on the order.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_n := v_n + 1;
    BEGIN
      INSERT INTO job_photo_order_items (order_id, tenant_id, engagement_id, image_key, file_name, included, price_minor)
      VALUES (
        v_order_id, v_shop.tenant_id, p_engagement_id,
        trim(v_item->>'image_key'), trim(v_item->>'file_name'),
        v_n <= v_free,
        CASE WHEN v_n <= v_free OR p_all_photos THEN 0 ELSE v_shop.price_per_photo_minor END
      );
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'create_job_photo_order: already_bought %', v_item->>'image_key';
    END;
  END LOOP;

  IF p_all_photos AND v_total > 0 THEN
    -- Spread the bundle price over the paid lines so per-photo sums stay true.
    UPDATE job_photo_order_items SET price_minor = v_total / GREATEST(1, v_count - v_free)
    WHERE order_id = v_order_id AND NOT included;
    UPDATE job_photo_order_items SET price_minor = price_minor + v_total % GREATEST(1, v_count - v_free)
    WHERE id = (SELECT id FROM job_photo_order_items WHERE order_id = v_order_id AND NOT included
                ORDER BY created_at, id LIMIT 1);
  END IF;


  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_shop.tenant_id, NULL, 'job_photo_order.created', 'engagement', p_engagement_id,
          jsonb_build_object('order_id', v_order_id, 'photo_count', v_count, 'included', v_free,
                             'total_minor', v_total, 'all_photos', p_all_photos,
                             'pay_by_cash', COALESCE(p_pay_by_cash, false) AND v_total > 0));

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'status', CASE WHEN v_total = 0 THEN 'paid' ELSE 'awaiting_payment' END,
    'photo_count', v_count,
    'included_count', v_free,
    'total_minor', v_total,
    'currency', v_shop.currency,
    'job_payment_request_id', v_request_id,
    'pay_token', v_token,
    'pay_by_cash', COALESCE(p_pay_by_cash, false) AND v_total > 0
  );
END;
$$;
REVOKE ALL ON FUNCTION create_job_photo_order(UUID, UUID, JSONB, BOOLEAN, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_job_photo_order(UUID, UUID, JSONB, BOOLEAN, TEXT, BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION get_client_photo_shop(p_engagement_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop      job_photo_shops%ROWTYPE;
  v_used_free INT;
  v_paid      BIGINT;
BEGIN
  SELECT * INTO v_shop FROM job_photo_shops WHERE engagement_id = p_engagement_id;
  IF NOT FOUND THEN
    IF NOT (photo_shop_is_client(p_engagement_id)
            OR photo_shop_is_admin((SELECT tenant_id FROM engagements WHERE id = p_engagement_id))) THEN
      RAISE EXCEPTION 'get_client_photo_shop: access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN jsonb_build_object('engagement_id', p_engagement_id, 'has_shop', false);
  END IF;
  IF NOT (photo_shop_is_client(p_engagement_id) OR photo_shop_is_admin(v_shop.tenant_id)) THEN
    RAISE EXCEPTION 'get_client_photo_shop: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN i.included THEN 1 ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN o.status IN ('paid', 'delivered') THEN i.price_minor ELSE 0 END), 0)
    INTO v_used_free, v_paid
  FROM job_photo_order_items i
  JOIN job_photo_orders o ON o.id = i.order_id
  WHERE i.engagement_id = p_engagement_id AND i.voided_at IS NULL;

  RETURN jsonb_build_object(
    'engagement_id',          p_engagement_id,
    'has_shop',               v_shop.gallery_key IS NOT NULL,
    'open',                   v_shop.gallery_key IS NOT NULL AND v_shop.closes_at > now(),
    'closes_at',              v_shop.closes_at,
    'currency',               v_shop.currency,
    'included_photos',        v_shop.included_photos,
    'included_left',          GREATEST(0, v_shop.included_photos - v_used_free),
    'price_per_photo_minor',  v_shop.price_per_photo_minor,
    'all_photos_price_minor', v_shop.all_photos_price_minor,
    'spent_minor',            v_paid,
    'bought_image_keys',      COALESCE((
        SELECT jsonb_agg(i.image_key ORDER BY i.created_at)
        FROM job_photo_order_items i
        JOIN job_photo_orders o ON o.id = i.order_id
        WHERE i.engagement_id = p_engagement_id AND i.voided_at IS NULL
          AND o.status IN ('paid', 'delivered', 'refunded')), '[]'::jsonb),
    'awaiting_image_keys',    COALESCE((
        SELECT jsonb_agg(i.image_key ORDER BY i.created_at)
        FROM job_photo_order_items i
        JOIN job_photo_orders o ON o.id = i.order_id
        WHERE i.engagement_id = p_engagement_id AND i.voided_at IS NULL
          AND o.status = 'awaiting_payment'), '[]'::jsonb),
    'cash_image_keys',        COALESCE((
        SELECT jsonb_agg(i.image_key ORDER BY i.created_at)
        FROM job_photo_order_items i
        JOIN job_photo_orders o ON o.id = i.order_id
        WHERE i.engagement_id = p_engagement_id AND i.voided_at IS NULL
          AND o.status = 'awaiting_payment' AND o.pay_by_cash), '[]'::jsonb),
    'orders',                 COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', o.id,
                 'status', o.status,
                 'photo_count', o.photo_count,
                 'included_count', o.included_count,
                 'total_minor', o.total_minor,
                 'currency', o.currency,
                 'created_at', o.created_at,
                 'paid_at', o.paid_at,
                 'delivered_at', o.delivered_at,
                 'pay_token', CASE WHEN o.status = 'awaiting_payment' THEN r.public_token END,
                 'pay_by_cash', o.pay_by_cash,
                 'delivery_url', CASE WHEN o.status IN ('delivered', 'refunded') THEN o.delivery_url END
               ) ORDER BY o.created_at DESC)
        FROM job_photo_orders o
        LEFT JOIN job_payment_requests r ON r.id = o.job_payment_request_id
        WHERE o.engagement_id = p_engagement_id AND o.status <> 'cancelled'), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION get_client_photo_shop(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_client_photo_shop(UUID) TO authenticated;
