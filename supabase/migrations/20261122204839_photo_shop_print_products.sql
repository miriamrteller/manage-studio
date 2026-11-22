-- =============================================================================
-- 20261122204839: Photo shop: prints and other products alongside digital photos.
-- Owner, 22 Nov 2026: "we need options to buy other things". The studio lists its
-- products (name in EN and HE, size, price) in Photo shop > Prices; per photo, the
-- client picks the digital file and/or any number of products, then pays by card or
-- pays the studio directly, as before. Nothing here can stop a client paying.
--
--   * tenant_photo_products: the studio's products (prints, canvases, ...). Studio
--     admins manage them directly (RLS); clients see the active ones only through
--     get_client_photo_shop().
--   * job_photo_order_items.kind: 'digital' (as before) or 'product'. A product line
--     keeps a copy of the product's name, size and price at order time, so the order
--     stays readable if the studio later changes or removes the product.
--     Only digital lines are "bought once per shoot"; the same photo can be printed
--     many times, and a print never stops the client buying the digital file.
--   * job_photo_orders.product_count: product lines in the order. photo_count now
--     counts digital photos only and may be 0 for a prints-only order.
--   * create_job_photo_order(..., p_products): product lines priced here from the
--     studio's own products, never from the caller. Free (package) photos and the
--     "all photos" price apply to digital files only.
--   * get_client_photo_shop: gains the studio's products; bought/awaiting keys and
--     spent_minor count digital lines only; orders carry product_count.
--
-- ADDITIVE MIGRATION: one table, new columns, one CHECK relaxed, one unique index
-- narrowed to digital lines, two functions replaced (one gains a parameter).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The studio's products
-- ---------------------------------------------------------------------------
CREATE TABLE tenant_photo_products (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name_en      TEXT        NOT NULL CHECK (length(trim(name_en)) BETWEEN 1 AND 120),
  name_he      TEXT        NOT NULL CHECK (length(trim(name_he)) BETWEEN 1 AND 120),
  size_label   TEXT        CHECK (size_label IS NULL OR length(size_label) <= 60),
  price_minor  INT         NOT NULL CHECK (price_minor > 0),
  position     INT         NOT NULL DEFAULT 0,
  active       BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE tenant_photo_products IS
  'Products the studio sells per photo besides the digital file (prints, canvases ...). Prices in minor units of the studio currency. Clients see active ones through get_client_photo_shop().';

CREATE INDEX idx_tenant_photo_products_tenant ON tenant_photo_products(tenant_id, position);

CREATE TRIGGER trigger_tenant_photo_products_updated_at
  BEFORE UPDATE ON tenant_photo_products
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

ALTER TABLE tenant_photo_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_photo_products_super_admin ON tenant_photo_products FOR ALL USING (is_super_admin());
CREATE POLICY tenant_photo_products_admin_manage ON tenant_photo_products FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (select auth.uid()) AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (select auth.uid()) AND 'tenant_admin' = ANY(role)));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenant_photo_products TO authenticated;
GRANT ALL ON TABLE tenant_photo_products TO service_role;

-- ---------------------------------------------------------------------------
-- Order lines: digital or product
-- ---------------------------------------------------------------------------
ALTER TABLE job_photo_order_items
  ADD COLUMN kind            TEXT NOT NULL DEFAULT 'digital' CHECK (kind IN ('digital', 'product')),
  ADD COLUMN product_id      UUID REFERENCES tenant_photo_products(id) ON DELETE SET NULL,
  ADD COLUMN product_name_en TEXT,
  ADD COLUMN product_name_he TEXT,
  ADD COLUMN product_size    TEXT,
  ADD CONSTRAINT job_photo_order_items_product_named
    CHECK (kind = 'digital' OR (product_name_en IS NOT NULL AND product_name_he IS NOT NULL));
COMMENT ON COLUMN job_photo_order_items.kind IS
  'digital: the photo file (bought once per shoot). product: a print or other product of the photo, named and priced as at order time.';

DROP INDEX IF EXISTS uq_job_photo_order_items_live;
CREATE UNIQUE INDEX uq_job_photo_order_items_live
  ON job_photo_order_items(engagement_id, image_key) WHERE voided_at IS NULL AND kind = 'digital';

ALTER TABLE job_photo_orders ADD COLUMN product_count INT NOT NULL DEFAULT 0 CHECK (product_count >= 0);
COMMENT ON COLUMN job_photo_orders.product_count IS
  'Product lines (prints ...) in the order. photo_count counts digital photos only.';
ALTER TABLE job_photo_orders DROP CONSTRAINT IF EXISTS job_photo_orders_photo_count_check;
ALTER TABLE job_photo_orders ADD CONSTRAINT job_photo_orders_photo_count_check CHECK (photo_count >= 0);
ALTER TABLE job_photo_orders ADD CONSTRAINT job_photo_orders_not_empty CHECK (photo_count + product_count > 0);

-- ---------------------------------------------------------------------------
-- Place an order: digital photos and products
--   p_items:    [{"image_key","file_name"}]                 digital files
--   p_products: [{"image_key","file_name","product_id"}]    one line per product
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS create_job_photo_order(UUID, UUID, JSONB, BOOLEAN, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION create_job_photo_order(
  p_engagement_id UUID,
  p_person_id     UUID,
  p_items         JSONB,
  p_all_photos    BOOLEAN DEFAULT false,
  p_label         TEXT    DEFAULT 'Photos',
  p_pay_by_cash   BOOLEAN DEFAULT false,
  p_products      JSONB   DEFAULT '[]'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop          job_photo_shops%ROWTYPE;
  v_count         INT;
  v_pcount        INT;
  v_used_free     INT;
  v_free          INT;
  v_paid_before   BIGINT;
  v_digital_total BIGINT;
  v_products_total BIGINT := 0;
  v_total         BIGINT;
  v_order_id      UUID;
  v_request_id    UUID;
  v_token         TEXT;
  v_item          JSONB;
  v_product       tenant_photo_products%ROWTYPE;
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
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'create_job_photo_order: no_photos';
  END IF;
  IF p_products IS NULL OR jsonb_typeof(p_products) <> 'array' THEN
    p_products := '[]'::jsonb;
  END IF;
  v_count := jsonb_array_length(p_items);
  v_pcount := jsonb_array_length(p_products);
  IF v_count + v_pcount = 0 THEN
    RAISE EXCEPTION 'create_job_photo_order: no_photos';
  END IF;
  IF v_count > 10000 OR v_pcount > 500 THEN
    RAISE EXCEPTION 'create_job_photo_order: too_many_photos';
  END IF;
  IF p_all_photos AND v_count = 0 THEN
    RAISE EXCEPTION 'create_job_photo_order: no_photos';
  END IF;

  -- The cart replaces this person's earlier unpaid card orders for the shoot. An order
  -- sent in to be paid in cash is kept: the studio may already be preparing it.
  UPDATE job_payment_requests r SET status = 'cancelled'
  FROM job_photo_orders o
  WHERE o.engagement_id = p_engagement_id AND o.person_id = p_person_id
    AND o.status = 'awaiting_payment' AND NOT o.pay_by_cash AND r.id = o.job_payment_request_id
    AND r.status IN ('pending', 'sent');

  -- Free photos already used and money kept so far, digital files only.
  SELECT COALESCE(SUM(CASE WHEN i.included THEN 1 ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN o.status IN ('paid', 'delivered') THEN i.price_minor ELSE 0 END), 0)
    INTO v_used_free, v_paid_before
  FROM job_photo_order_items i
  JOIN job_photo_orders o ON o.id = i.order_id
  WHERE i.engagement_id = p_engagement_id AND i.voided_at IS NULL AND i.kind = 'digital';

  v_free := LEAST(v_count, GREATEST(0, v_shop.included_photos - v_used_free));

  IF v_count = 0 THEN
    v_digital_total := 0;
  ELSIF p_all_photos THEN
    IF v_shop.all_photos_price_minor IS NULL THEN
      RAISE EXCEPTION 'create_job_photo_order: no_all_photos_price';
    END IF;
    v_digital_total := GREATEST(0, v_shop.all_photos_price_minor - v_paid_before);
    IF v_shop.price_per_photo_minor IS NOT NULL THEN
      v_digital_total := LEAST(v_digital_total, (v_count - v_free)::BIGINT * v_shop.price_per_photo_minor);
    END IF;
    IF v_count = v_free THEN
      v_digital_total := 0;
    END IF;
  ELSE
    IF v_count > v_free AND v_shop.price_per_photo_minor IS NULL THEN
      RAISE EXCEPTION 'create_job_photo_order: no_price';
    END IF;
    v_digital_total := (v_count - v_free)::BIGINT * COALESCE(v_shop.price_per_photo_minor, 0);
  END IF;

  -- Products: priced from the studio's own active products.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_products) LOOP
    SELECT * INTO v_product FROM tenant_photo_products
    WHERE id = NULLIF(v_item->>'product_id', '')::UUID AND tenant_id = v_shop.tenant_id AND active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'create_job_photo_order: product_not_found';
    END IF;
    v_products_total := v_products_total + v_product.price_minor;
  END LOOP;

  v_total := v_digital_total + v_products_total;
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
    tenant_id, engagement_id, person_id, status, all_photos, photo_count, product_count, included_count,
    total_minor, currency, paid_at, job_payment_request_id, pay_by_cash
  ) VALUES (
    v_shop.tenant_id, p_engagement_id, p_person_id,
    CASE WHEN v_total = 0 THEN 'paid' ELSE 'awaiting_payment' END,
    p_all_photos, v_count, v_pcount, v_free, v_total::INT, v_shop.currency,
    CASE WHEN v_total = 0 THEN now() END, v_request_id, COALESCE(p_pay_by_cash, false) AND v_total > 0
  )
  RETURNING id INTO v_order_id;

  -- Digital files: free photos first, then paid; with "all photos" the price sits on the order.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_n := v_n + 1;
    BEGIN
      INSERT INTO job_photo_order_items (order_id, tenant_id, engagement_id, image_key, file_name, included, price_minor, kind)
      VALUES (
        v_order_id, v_shop.tenant_id, p_engagement_id,
        trim(v_item->>'image_key'), trim(v_item->>'file_name'),
        v_n <= v_free,
        CASE WHEN v_n <= v_free OR p_all_photos THEN 0 ELSE v_shop.price_per_photo_minor END,
        'digital'
      );
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'create_job_photo_order: already_bought %', v_item->>'image_key';
    END;
  END LOOP;

  IF p_all_photos AND v_digital_total > 0 THEN
    -- Spread the bundle price over the paid digital lines so per-photo sums stay true.
    UPDATE job_photo_order_items SET price_minor = v_digital_total / GREATEST(1, v_count - v_free)
    WHERE order_id = v_order_id AND NOT included AND kind = 'digital';
    UPDATE job_photo_order_items SET price_minor = price_minor + v_digital_total % GREATEST(1, v_count - v_free)
    WHERE id = (SELECT id FROM job_photo_order_items WHERE order_id = v_order_id AND NOT included AND kind = 'digital'
                ORDER BY created_at, id LIMIT 1);
  END IF;

  -- Product lines, named and priced as now.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_products) LOOP
    SELECT * INTO v_product FROM tenant_photo_products
    WHERE id = (v_item->>'product_id')::UUID AND tenant_id = v_shop.tenant_id;
    INSERT INTO job_photo_order_items (
      order_id, tenant_id, engagement_id, image_key, file_name, included, price_minor,
      kind, product_id, product_name_en, product_name_he, product_size
    ) VALUES (
      v_order_id, v_shop.tenant_id, p_engagement_id,
      trim(v_item->>'image_key'), trim(v_item->>'file_name'), false, v_product.price_minor,
      'product', v_product.id, trim(v_product.name_en), trim(v_product.name_he), NULLIF(trim(v_product.size_label), '')
    );
  END LOOP;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_shop.tenant_id, NULL, 'job_photo_order.created', 'engagement', p_engagement_id,
          jsonb_build_object('order_id', v_order_id, 'photo_count', v_count, 'product_count', v_pcount,
                             'included', v_free, 'total_minor', v_total, 'all_photos', p_all_photos,
                             'pay_by_cash', COALESCE(p_pay_by_cash, false) AND v_total > 0));

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'status', CASE WHEN v_total = 0 THEN 'paid' ELSE 'awaiting_payment' END,
    'photo_count', v_count,
    'product_count', v_pcount,
    'included_count', v_free,
    'total_minor', v_total,
    'currency', v_shop.currency,
    'job_payment_request_id', v_request_id,
    'pay_token', v_token,
    'pay_by_cash', COALESCE(p_pay_by_cash, false) AND v_total > 0
  );
END;
$$;
REVOKE ALL ON FUNCTION create_job_photo_order(UUID, UUID, JSONB, BOOLEAN, TEXT, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_job_photo_order(UUID, UUID, JSONB, BOOLEAN, TEXT, BOOLEAN, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- What the client sees: now with the studio's products
-- ---------------------------------------------------------------------------
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
  WHERE i.engagement_id = p_engagement_id AND i.voided_at IS NULL AND i.kind = 'digital';

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
    'products',               COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', p.id, 'name_en', p.name_en, 'name_he', p.name_he,
                 'size', p.size_label, 'price_minor', p.price_minor
               ) ORDER BY p.position, p.created_at)
        FROM tenant_photo_products p
        WHERE p.tenant_id = v_shop.tenant_id AND p.active), '[]'::jsonb),
    'bought_image_keys',      COALESCE((
        SELECT jsonb_agg(i.image_key ORDER BY i.created_at)
        FROM job_photo_order_items i
        JOIN job_photo_orders o ON o.id = i.order_id
        WHERE i.engagement_id = p_engagement_id AND i.voided_at IS NULL AND i.kind = 'digital'
          AND o.status IN ('paid', 'delivered', 'refunded')), '[]'::jsonb),
    'awaiting_image_keys',    COALESCE((
        SELECT jsonb_agg(i.image_key ORDER BY i.created_at)
        FROM job_photo_order_items i
        JOIN job_photo_orders o ON o.id = i.order_id
        WHERE i.engagement_id = p_engagement_id AND i.voided_at IS NULL AND i.kind = 'digital'
          AND o.status = 'awaiting_payment'), '[]'::jsonb),
    'cash_image_keys',        COALESCE((
        SELECT jsonb_agg(i.image_key ORDER BY i.created_at)
        FROM job_photo_order_items i
        JOIN job_photo_orders o ON o.id = i.order_id
        WHERE i.engagement_id = p_engagement_id AND i.voided_at IS NULL AND i.kind = 'digital'
          AND o.status = 'awaiting_payment' AND o.pay_by_cash), '[]'::jsonb),
    'orders',                 COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', o.id,
                 'status', o.status,
                 'photo_count', o.photo_count,
                 'product_count', o.product_count,
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
