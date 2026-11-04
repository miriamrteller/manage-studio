-- =============================================================================
-- 20261104171055: Photo shop — clients buy downloads from the studio's own
-- photo gallery (SmugMug first). Data model only; no provider calls here.
--
-- The studio's photos stay with the provider. OpalSwift stores no photos, only
-- the provider's image keys and file names of what was bought, and the
-- download-gallery link the studio pastes when it delivers.
--
--   * Feature 'billing:photo_shop' with profile_gate 'opt_in': never switched
--     on by plan or profile, only by a tenant override (beta).
--   * offerings.photos_included — how many photos a package includes (default 0).
--   * tenant_photo_shop_settings — studio defaults (price per photo, optional
--     "all photos" price, how long a gallery stays open).
--   * job_photo_shops — one per shoot: the picked gallery and its prices,
--     prefilled from the package and the studio defaults, editable.
--   * job_photo_orders / job_photo_order_items — each purchase. A photo can be
--     bought once per shoot (unique while the item is not voided). Payment goes
--     through job_payment_requests, so Finance, receipts, /pay and "Record a
--     payment" work unchanged; a trigger keeps the order in step.
--
-- Refunds: a refund before delivery cancels the order and frees its photos;
-- after delivery the order is marked refunded and the photos stay bought.
--
-- ADDITIVE MIGRATION: new objects only, plus one CHECK widened.
-- DEPENDENCIES: 20261030000100 (job_details), 20261030000200 (job_payment_requests),
--               20261103130956 (feature_definitions.profile_gate)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Feature flag (opt-in only)
-- ---------------------------------------------------------------------------
ALTER TABLE feature_definitions DROP CONSTRAINT IF EXISTS feature_definitions_profile_gate_check;
ALTER TABLE feature_definitions ADD CONSTRAINT feature_definitions_profile_gate_check
  CHECK (profile_gate IN ('recurring', 'project', 'teaches_classes', 'family_accounts', 'client_booking', 'opt_in'));
COMMENT ON COLUMN feature_definitions.profile_gate IS
  'Which business-profile switch turns the feature on. NULL = core. opt_in = only a tenant override turns it on (beta features).';

INSERT INTO feature_definitions (key, description, tier_minimum, skin_restriction, profile_gate) VALUES
  ('billing:photo_shop', 'Clients buy photo downloads from the studio''s gallery (beta)', 'essential', NULL, 'opt_in')
ON CONFLICT (key) DO NOTHING;
UPDATE feature_definitions SET profile_gate = 'opt_in' WHERE key = 'billing:photo_shop';

-- ---------------------------------------------------------------------------
-- Package field
-- ---------------------------------------------------------------------------
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS photos_included INT NOT NULL DEFAULT 0
  CHECK (photos_included BETWEEN 0 AND 10000);
COMMENT ON COLUMN offerings.photos_included IS
  'Photos the package includes at no extra cost in the photo shop. Copied to each shoot''s shop as a prefill.';

-- ---------------------------------------------------------------------------
-- Studio defaults
-- ---------------------------------------------------------------------------
CREATE TABLE tenant_photo_shop_settings (
  tenant_id               UUID        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  price_per_photo_minor   INT         CHECK (price_per_photo_minor > 0),
  all_photos_price_minor  INT         CHECK (all_photos_price_minor > 0),
  gallery_open_days       INT         NOT NULL DEFAULT 90 CHECK (gallery_open_days BETWEEN 1 AND 3650),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE tenant_photo_shop_settings IS
  'Studio defaults for the photo shop, prefilled into each shoot. Prices in minor units of the studio currency.';

CREATE TRIGGER trigger_tenant_photo_shop_settings_updated_at
  BEFORE UPDATE ON tenant_photo_shop_settings
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

ALTER TABLE tenant_photo_shop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_photo_shop_settings_super_admin ON tenant_photo_shop_settings FOR ALL USING (is_super_admin());
CREATE POLICY tenant_photo_shop_settings_admin_manage ON tenant_photo_shop_settings FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)))
  WITH CHECK (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
GRANT SELECT, INSERT, UPDATE ON TABLE tenant_photo_shop_settings TO authenticated;
GRANT ALL ON TABLE tenant_photo_shop_settings TO service_role;

-- ---------------------------------------------------------------------------
-- One shop per shoot
-- ---------------------------------------------------------------------------
CREATE TABLE job_photo_shops (
  engagement_id           UUID        PRIMARY KEY REFERENCES engagements(id) ON DELETE CASCADE,
  tenant_id               UUID        NOT NULL REFERENCES tenants(id),
  provider                TEXT        NOT NULL DEFAULT 'smugmug' CHECK (provider IN ('smugmug', 'mock')),
  gallery_key             TEXT,
  gallery_name            TEXT,
  included_photos         INT         NOT NULL DEFAULT 0 CHECK (included_photos BETWEEN 0 AND 10000),
  price_per_photo_minor   INT         CHECK (price_per_photo_minor > 0),
  all_photos_price_minor  INT         CHECK (all_photos_price_minor > 0),
  currency                TEXT        NOT NULL DEFAULT 'ILS',
  closes_at               TIMESTAMPTZ NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE job_photo_shops IS
  'Photo shop for one shoot: the studio''s proofing gallery at the provider and its prices. Clients read it only through get_client_photo_shop().';
COMMENT ON COLUMN job_photo_shops.gallery_key IS
  'The provider''s gallery id (SmugMug album key). NULL until the studio picks a gallery.';
COMMENT ON COLUMN job_photo_shops.closes_at IS
  'After this, clients can still see what they bought but cannot buy more.';

CREATE INDEX idx_job_photo_shops_tenant ON job_photo_shops(tenant_id);

CREATE TRIGGER trigger_job_photo_shops_updated_at
  BEFORE UPDATE ON job_photo_shops
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

ALTER TABLE job_photo_shops ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_photo_shops_super_admin ON job_photo_shops FOR ALL USING (is_super_admin());
CREATE POLICY job_photo_shops_admin_select ON job_photo_shops FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
GRANT SELECT ON TABLE job_photo_shops TO authenticated;
GRANT ALL ON TABLE job_photo_shops TO service_role;

-- ---------------------------------------------------------------------------
-- Orders and the photos in them
-- ---------------------------------------------------------------------------
CREATE TABLE job_photo_orders (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES tenants(id),
  engagement_id           UUID        NOT NULL REFERENCES job_photo_shops(engagement_id) ON DELETE CASCADE,
  person_id               UUID        REFERENCES people(id),
  status                  TEXT        NOT NULL DEFAULT 'awaiting_payment'
                          CHECK (status IN ('awaiting_payment', 'paid', 'delivered', 'cancelled', 'refunded')),
  all_photos              BOOLEAN     NOT NULL DEFAULT false,
  photo_count             INT         NOT NULL CHECK (photo_count > 0),
  included_count          INT         NOT NULL DEFAULT 0 CHECK (included_count >= 0),
  total_minor             INT         NOT NULL CHECK (total_minor >= 0),
  currency                TEXT        NOT NULL,
  job_payment_request_id  UUID        UNIQUE REFERENCES job_payment_requests(id),
  delivery_url            TEXT,
  paid_at                 TIMESTAMPTZ,
  delivered_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  refunded_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (included_count <= photo_count),
  CHECK (total_minor = 0 OR job_payment_request_id IS NOT NULL),
  CHECK (status <> 'delivered' OR (delivery_url IS NOT NULL AND delivered_at IS NOT NULL))
);
COMMENT ON TABLE job_photo_orders IS
  'One purchase in a shoot''s photo shop. Paid through job_payment_requests (Finance, receipts); the status follows that request.';
COMMENT ON COLUMN job_photo_orders.delivery_url IS
  'Download-gallery link the studio pastes when delivering. Shown only to the shoot''s client, only once delivered.';

CREATE INDEX idx_job_photo_orders_engagement ON job_photo_orders(engagement_id);
CREATE INDEX idx_job_photo_orders_tenant_status ON job_photo_orders(tenant_id, status);

CREATE TRIGGER trigger_job_photo_orders_updated_at
  BEFORE UPDATE ON job_photo_orders
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

CREATE TABLE job_photo_order_items (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID        NOT NULL REFERENCES job_photo_orders(id) ON DELETE CASCADE,
  tenant_id      UUID        NOT NULL REFERENCES tenants(id),
  engagement_id  UUID        NOT NULL,
  image_key      TEXT        NOT NULL CHECK (length(image_key) BETWEEN 1 AND 200),
  file_name      TEXT        NOT NULL CHECK (length(file_name) BETWEEN 1 AND 500),
  included       BOOLEAN     NOT NULL DEFAULT false,
  price_minor    INT         NOT NULL CHECK (price_minor >= 0),
  voided_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE job_photo_order_items IS
  'Photos in an order: the provider''s image key and file name only, never the photo. voided_at frees the photo to be bought again (order cancelled, or refunded before delivery).';

-- A photo is bought (or waiting for payment) at most once per shoot.
CREATE UNIQUE INDEX uq_job_photo_order_items_live
  ON job_photo_order_items(engagement_id, image_key) WHERE voided_at IS NULL;
CREATE INDEX idx_job_photo_order_items_order ON job_photo_order_items(order_id);

ALTER TABLE job_photo_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_photo_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_photo_orders_super_admin ON job_photo_orders FOR ALL USING (is_super_admin());
CREATE POLICY job_photo_order_items_super_admin ON job_photo_order_items FOR ALL USING (is_super_admin());
CREATE POLICY job_photo_orders_admin_select ON job_photo_orders FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY job_photo_order_items_admin_select ON job_photo_order_items FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
GRANT SELECT ON TABLE job_photo_orders, job_photo_order_items TO authenticated;
GRANT ALL ON TABLE job_photo_orders, job_photo_order_items TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Admin of the shoot's studio (or super admin)?
CREATE OR REPLACE FUNCTION photo_shop_is_admin(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(is_super_admin(), false) OR COALESCE(
    p_tenant_id = get_my_tenant_id() AND EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)), false);
$$;
REVOKE ALL ON FUNCTION photo_shop_is_admin(UUID) FROM PUBLIC, anon, authenticated;

-- The shoot's client (the person, or anyone in their account)?
CREATE OR REPLACE FUNCTION photo_shop_is_client(p_engagement_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT e.tenant_id = get_my_tenant_id() AND (
             e.person_id = get_my_person_id()
             OR e.person_id IN (SELECT id FROM people WHERE account_id IN (SELECT get_my_account_ids())))
    FROM engagements e WHERE e.id = p_engagement_id), false);
$$;
REVOKE ALL ON FUNCTION photo_shop_is_client(UUID) FROM PUBLIC, anon, authenticated;

-- What a new shop would be prefilled with: package + studio defaults.
CREATE OR REPLACE FUNCTION photo_shop_prefill(p_engagement_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'engagement_id',          e.id,
    'tenant_id',              e.tenant_id,
    'provider',               'smugmug',
    'gallery_key',            NULL,
    'gallery_name',           NULL,
    'included_photos',        COALESCE(o.photos_included, 0),
    'price_per_photo_minor',  s.price_per_photo_minor,
    'all_photos_price_minor', s.all_photos_price_minor,
    'currency',               upper(COALESCE(t.currency, 'ILS')),
    'closes_at',              now() + make_interval(days => COALESCE(s.gallery_open_days, 90)),
    'saved',                  false
  )
  FROM engagements e
  JOIN tenants t ON t.id = e.tenant_id
  LEFT JOIN offerings o ON o.id = e.offering_id
  LEFT JOIN tenant_photo_shop_settings s ON s.tenant_id = e.tenant_id
  WHERE e.id = p_engagement_id;
$$;
REVOKE ALL ON FUNCTION photo_shop_prefill(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC (admin): the shoot's shop, saved or prefilled
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_job_photo_shop(p_engagement_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id UUID;
  v_shop      job_photo_shops%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM engagements WHERE id = p_engagement_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'get_job_photo_shop: job not found';
  END IF;
  IF NOT photo_shop_is_admin(v_tenant_id) THEN
    RAISE EXCEPTION 'get_job_photo_shop: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_shop FROM job_photo_shops WHERE engagement_id = p_engagement_id;
  IF NOT FOUND THEN
    RETURN photo_shop_prefill(p_engagement_id);
  END IF;
  RETURN to_jsonb(v_shop) || jsonb_build_object('saved', true);
END;
$$;
REVOKE ALL ON FUNCTION get_job_photo_shop(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_job_photo_shop(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC (admin): save the shoot's shop. Missing keys keep the current (or
-- prefilled) value; an explicit JSON null clears an optional price.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_job_photo_shop(p_engagement_id UUID, p_settings JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id UUID;
  v_cur       JSONB;
  v_new       JSONB;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM engagements WHERE id = p_engagement_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'save_job_photo_shop: job not found';
  END IF;
  IF NOT photo_shop_is_admin(v_tenant_id) THEN
    RAISE EXCEPTION 'save_job_photo_shop: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION 'save_job_photo_shop: settings must be an object';
  END IF;

  SELECT to_jsonb(s) INTO v_cur FROM job_photo_shops s WHERE s.engagement_id = p_engagement_id;
  v_cur := COALESCE(v_cur, photo_shop_prefill(p_engagement_id));
  -- Only these keys are editable; tenant, shoot and currency come from the job.
  v_new := v_cur || (p_settings - ARRAY['engagement_id', 'tenant_id', 'currency', 'saved', 'created_at', 'updated_at']);

  INSERT INTO job_photo_shops AS s (
    engagement_id, tenant_id, provider, gallery_key, gallery_name, included_photos,
    price_per_photo_minor, all_photos_price_minor, currency, closes_at
  ) VALUES (
    p_engagement_id, v_tenant_id,
    COALESCE(v_new->>'provider', 'smugmug'),
    NULLIF(trim(v_new->>'gallery_key'), ''),
    NULLIF(trim(v_new->>'gallery_name'), ''),
    COALESCE((v_new->>'included_photos')::INT, 0),
    (v_new->>'price_per_photo_minor')::INT,
    (v_new->>'all_photos_price_minor')::INT,
    v_cur->>'currency',
    (v_new->>'closes_at')::TIMESTAMPTZ
  )
  ON CONFLICT (engagement_id) DO UPDATE SET
    provider               = EXCLUDED.provider,
    gallery_key            = EXCLUDED.gallery_key,
    gallery_name           = EXCLUDED.gallery_name,
    included_photos        = EXCLUDED.included_photos,
    price_per_photo_minor  = EXCLUDED.price_per_photo_minor,
    all_photos_price_minor = EXCLUDED.all_photos_price_minor,
    closes_at              = EXCLUDED.closes_at;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_tenant_id, auth.uid(), 'job_photo_shop.saved', 'engagement', p_engagement_id,
          p_settings - ARRAY['tenant_id', 'engagement_id']);

  RETURN get_job_photo_shop(p_engagement_id);
END;
$$;
REVOKE ALL ON FUNCTION save_job_photo_shop(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_job_photo_shop(UUID, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC (service): place an order. Called by the Edge Function after it has
-- checked every image key against the provider's gallery. Earlier unpaid
-- orders from this shoot by the same person are cancelled first (the cart
-- replaces them). Prices are worked out here, never taken from the caller.
--   p_items: [{"image_key":"abc","file_name":"IMG_0001.jpg"}, ...]
--   p_all_photos: the client chose the "all photos" price; p_items must then
--   hold every photo in the gallery not bought yet.
-- Mirror of the maths: packages/shared/src/photo-shop/pricing.ts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_job_photo_order(
  p_engagement_id UUID,
  p_person_id     UUID,
  p_items         JSONB,
  p_all_photos    BOOLEAN DEFAULT false,
  p_label         TEXT    DEFAULT 'Photos'
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

  -- The cart replaces this person's earlier unpaid orders for the shoot.
  UPDATE job_payment_requests r SET status = 'cancelled'
  FROM job_photo_orders o
  WHERE o.engagement_id = p_engagement_id AND o.person_id = p_person_id
    AND o.status = 'awaiting_payment' AND r.id = o.job_payment_request_id
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
    total_minor, currency, paid_at, job_payment_request_id
  ) VALUES (
    v_shop.tenant_id, p_engagement_id, p_person_id,
    CASE WHEN v_total = 0 THEN 'paid' ELSE 'awaiting_payment' END,
    p_all_photos, v_count, v_free, v_total::INT, v_shop.currency,
    CASE WHEN v_total = 0 THEN now() END, v_request_id
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
                             'total_minor', v_total, 'all_photos', p_all_photos));

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'status', CASE WHEN v_total = 0 THEN 'paid' ELSE 'awaiting_payment' END,
    'photo_count', v_count,
    'included_count', v_free,
    'total_minor', v_total,
    'currency', v_shop.currency,
    'job_payment_request_id', v_request_id,
    'pay_token', v_token
  );
END;
$$;
REVOKE ALL ON FUNCTION create_job_photo_order(UUID, UUID, JSONB, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_job_photo_order(UUID, UUID, JSONB, BOOLEAN, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Keep the order in step with its payment request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION job_photo_orders_follow_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order job_photo_orders%ROWTYPE;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_order FROM job_photo_orders WHERE job_payment_request_id = NEW.id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' AND v_order.status = 'awaiting_payment' THEN
    UPDATE job_photo_orders SET status = 'paid', paid_at = COALESCE(NEW.paid_at, now()) WHERE id = v_order.id;

  ELSIF NEW.status = 'cancelled' AND v_order.status = 'awaiting_payment' THEN
    UPDATE job_photo_orders SET status = 'cancelled', cancelled_at = now() WHERE id = v_order.id;
    UPDATE job_photo_order_items SET voided_at = now() WHERE order_id = v_order.id AND voided_at IS NULL;

  ELSIF NEW.status = 'refunded_manual' THEN
    IF v_order.status = 'delivered' THEN
      -- Already delivered: record the refund only; the photos stay bought.
      UPDATE job_photo_orders SET status = 'refunded', refunded_at = now() WHERE id = v_order.id;
    ELSE
      UPDATE job_photo_orders SET status = 'cancelled', cancelled_at = now(), refunded_at = now() WHERE id = v_order.id;
      UPDATE job_photo_order_items SET voided_at = now() WHERE order_id = v_order.id AND voided_at IS NULL;
    END IF;

  ELSIF NEW.status = 'pending' AND v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'job_payment_requests: a cancelled photo order cannot be reopened; the client places a new order';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION job_photo_orders_follow_request() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trigger_job_photo_orders_follow_request
  AFTER UPDATE OF status ON job_payment_requests
  FOR EACH ROW EXECUTE FUNCTION job_photo_orders_follow_request();

-- ---------------------------------------------------------------------------
-- RPC (admin): deliver an order — paste the download-gallery link and send.
-- Sending again on a delivered order replaces the link.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deliver_job_photo_order(p_order_id UUID, p_delivery_url TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order job_photo_orders%ROWTYPE;
  v_url   TEXT := trim(COALESCE(p_delivery_url, ''));
BEGIN
  SELECT * INTO v_order FROM job_photo_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deliver_job_photo_order: order not found';
  END IF;
  IF NOT photo_shop_is_admin(v_order.tenant_id) THEN
    RAISE EXCEPTION 'deliver_job_photo_order: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_order.status NOT IN ('paid', 'delivered') THEN
    RAISE EXCEPTION 'deliver_job_photo_order: order is %', v_order.status;
  END IF;
  IF v_url !~* '^https://[^\s/]+\.[^\s/]+(/\S*)?$' OR length(v_url) > 2000 THEN
    RAISE EXCEPTION 'deliver_job_photo_order: link must be an https web address';
  END IF;

  UPDATE job_photo_orders
     SET status = 'delivered', delivery_url = v_url, delivered_at = now()
   WHERE id = p_order_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_order.tenant_id, auth.uid(), 'job_photo_order.delivered', 'engagement', v_order.engagement_id,
          jsonb_build_object('order_id', p_order_id, 'redelivered', v_order.status = 'delivered'));

  RETURN (SELECT to_jsonb(o) FROM job_photo_orders o WHERE o.id = p_order_id);
END;
$$;
REVOKE ALL ON FUNCTION deliver_job_photo_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION deliver_job_photo_order(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC (client or admin): what the client sees. No gallery key (previews go
-- through the Edge Function), delivery links only on delivered orders.
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
