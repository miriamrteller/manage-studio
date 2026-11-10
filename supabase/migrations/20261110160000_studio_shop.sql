-- =============================================================================
-- 20261110160000: Studio shop (beta), studio side. A studio sells its own items
-- (uniforms, clothes, shoes, accessories) to its families. This migration holds
-- the catalogue: items, their sizes with stock, and a picture of each item.
-- Parents' cart, orders and payment come in the next migration (orders belong
-- to the child's class enrolment, so payment uses job_payment_requests as the
-- photo shop does, and Finance, receipts and /pay stay unchanged).
--
--   * Feature 'billing:studio_shop', profile_gate 'opt_in' (beta, tenant override only).
--   * shop_products: name, description, price, picture, shown or hidden, order.
--   * shop_product_variants: one row per size (or "One size"), stock optional.
--   * Bucket 'shop-product-images': public pictures of the items (no people),
--     shrunk in the studio's browser; studio admins upload into their own folder.
--
-- ADDITIVE MIGRATION: new objects only.
-- DEPENDENCIES: 20261104171055 (photo_shop_is_admin, feature_definitions.profile_gate)
-- =============================================================================

INSERT INTO feature_definitions (key, description, tier_minimum, skin_restriction, profile_gate) VALUES
  ('billing:studio_shop', 'Families buy the studio''s uniforms and items (beta)', 'essential', NULL, 'opt_in')
ON CONFLICT (key) DO NOTHING;
UPDATE feature_definitions SET profile_gate = 'opt_in' WHERE key = 'billing:studio_shop';

-- ---------------------------------------------------------------------------
-- Items and sizes
-- ---------------------------------------------------------------------------
CREATE TABLE shop_products (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description  TEXT        CHECK (description IS NULL OR length(description) <= 1000),
  price_minor  INT         NOT NULL CHECK (price_minor > 0),
  currency     TEXT        NOT NULL DEFAULT 'ILS',
  image_path   TEXT        CHECK (image_path IS NULL OR image_path ~ '^[0-9a-f-]+/[0-9a-f-]+\.jpg$'),
  active       BOOLEAN     NOT NULL DEFAULT true,
  position     INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE shop_products IS
  'Studio shop (beta): an item the studio sells to its families. active = shown to families.';
COMMENT ON COLUMN shop_products.image_path IS
  'Picture of the item in the public shop-product-images bucket: <tenant>/<uuid>.jpg.';
CREATE INDEX idx_shop_products_tenant ON shop_products(tenant_id, position);

CREATE TABLE shop_product_variants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 60),
  stock       INT         CHECK (stock IS NULL OR stock >= 0),
  position    INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, label)
);
COMMENT ON TABLE shop_product_variants IS
  'A size (or "One size") of a shop item. stock NULL = not counted (always available); 0 = sold out.';
CREATE INDEX idx_shop_product_variants_product ON shop_product_variants(product_id, position);
CREATE INDEX idx_shop_product_variants_tenant ON shop_product_variants(tenant_id);

CREATE TRIGGER trigger_shop_products_updated_at
  BEFORE UPDATE ON shop_products
  FOR EACH ROW EXECUTE FUNCTION update_job_details_updated_at();

ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY shop_products_super_admin ON shop_products FOR ALL USING (is_super_admin());
CREATE POLICY shop_products_admin_select ON shop_products FOR SELECT
  TO authenticated
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (select auth.uid()) AND 'tenant_admin' = ANY(role)));
CREATE POLICY shop_product_variants_super_admin ON shop_product_variants FOR ALL USING (is_super_admin());
CREATE POLICY shop_product_variants_admin_select ON shop_product_variants FOR SELECT
  TO authenticated
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (select auth.uid()) AND 'tenant_admin' = ANY(role)));
GRANT SELECT ON TABLE shop_products, shop_product_variants TO authenticated;
GRANT ALL ON TABLE shop_products, shop_product_variants TO service_role;

-- ---------------------------------------------------------------------------
-- Storage: public pictures of items; studio admins manage their own folder
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('shop-product-images', 'shop-product-images', true, 2097152, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins upload shop product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete shop product images" ON storage.objects;

CREATE POLICY "Admins upload shop product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'shop-product-images'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = (select auth.uid()) AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY "Admins delete shop product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'shop-product-images'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = (select auth.uid()) AND 'tenant_admin' = ANY(role)
    )
  );

-- ---------------------------------------------------------------------------
-- RPC (admin): add or change an item with its sizes.
--   p_product: {"id"?, "name", "description"?, "price_minor", "image_path"?, "active"?,
--               "variants": [{"id"?, "label", "stock"?}, ...]}
-- Sizes keep the order given; sizes left out are removed. No sizes = "One size".
-- Returns the item's id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_shop_product(p_product JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id UUID := get_my_tenant_id();
  v_id        UUID;
  v_image     TEXT;
  v_variants  JSONB;
  v_v         JSONB;
  v_vid       UUID;
  v_keep      UUID[] := ARRAY[]::UUID[];
  v_n         INT := 0;
  v_currency  TEXT;
BEGIN
  IF v_tenant_id IS NULL OR NOT photo_shop_is_admin(v_tenant_id) THEN
    RAISE EXCEPTION 'save_shop_product: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_product IS NULL OR jsonb_typeof(p_product) <> 'object' THEN
    RAISE EXCEPTION 'save_shop_product: bad_product';
  END IF;
  IF length(trim(COALESCE(p_product->>'name', ''))) = 0 THEN
    RAISE EXCEPTION 'save_shop_product: name_required';
  END IF;
  IF COALESCE((p_product->>'price_minor')::INT, 0) <= 0 THEN
    RAISE EXCEPTION 'save_shop_product: price_required';
  END IF;
  v_image := NULLIF(trim(COALESCE(p_product->>'image_path', '')), '');
  IF v_image IS NOT NULL AND v_image NOT LIKE v_tenant_id::text || '/%' THEN
    RAISE EXCEPTION 'save_shop_product: bad_image';
  END IF;
  v_variants := COALESCE(p_product->'variants', '[]'::jsonb);
  IF jsonb_typeof(v_variants) <> 'array' OR jsonb_array_length(v_variants) > 50 THEN
    RAISE EXCEPTION 'save_shop_product: bad_sizes';
  END IF;
  IF jsonb_array_length(v_variants) = 0 THEN
    v_variants := jsonb_build_array(jsonb_build_object('label', 'One size'));
  END IF;
  SELECT upper(COALESCE(currency, 'ILS')) INTO v_currency FROM tenants WHERE id = v_tenant_id;

  v_id := NULLIF(p_product->>'id', '')::UUID;
  IF v_id IS NULL THEN
    INSERT INTO shop_products (tenant_id, name, description, price_minor, currency, image_path, active, position)
    VALUES (
      v_tenant_id, trim(p_product->>'name'), NULLIF(trim(COALESCE(p_product->>'description', '')), ''),
      (p_product->>'price_minor')::INT, v_currency, v_image, COALESCE((p_product->>'active')::BOOLEAN, true),
      COALESCE((SELECT MAX(position) + 1 FROM shop_products WHERE tenant_id = v_tenant_id), 0)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE shop_products SET
      name        = trim(p_product->>'name'),
      description = NULLIF(trim(COALESCE(p_product->>'description', '')), ''),
      price_minor = (p_product->>'price_minor')::INT,
      image_path  = v_image,
      active      = COALESCE((p_product->>'active')::BOOLEAN, active)
    WHERE id = v_id AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'save_shop_product: not_found';
    END IF;
  END IF;

  -- Sizes: labels are unique per item, so clear old labels out of the way first.
  FOR v_v IN SELECT * FROM jsonb_array_elements(v_variants) LOOP
    v_vid := NULLIF(v_v->>'id', '')::UUID;
    IF v_vid IS NOT NULL AND EXISTS (SELECT 1 FROM shop_product_variants WHERE id = v_vid AND product_id = v_id) THEN
      v_keep := v_keep || v_vid;
    END IF;
  END LOOP;
  DELETE FROM shop_product_variants WHERE product_id = v_id AND NOT (id = ANY(v_keep));
  UPDATE shop_product_variants SET label = id::text WHERE product_id = v_id;

  FOR v_v IN SELECT * FROM jsonb_array_elements(v_variants) LOOP
    v_n := v_n + 1;
    IF length(trim(COALESCE(v_v->>'label', ''))) = 0 THEN
      RAISE EXCEPTION 'save_shop_product: size_label_required';
    END IF;
    IF (v_v->>'stock') IS NOT NULL AND (v_v->>'stock')::INT < 0 THEN
      RAISE EXCEPTION 'save_shop_product: bad_stock';
    END IF;
    v_vid := NULLIF(v_v->>'id', '')::UUID;
    BEGIN
      IF v_vid IS NOT NULL AND v_vid = ANY(v_keep) THEN
        UPDATE shop_product_variants
           SET label = trim(v_v->>'label'), stock = (v_v->>'stock')::INT, position = v_n
         WHERE id = v_vid;
      ELSE
        INSERT INTO shop_product_variants (product_id, tenant_id, label, stock, position)
        VALUES (v_id, v_tenant_id, trim(v_v->>'label'), (v_v->>'stock')::INT, v_n);
      END IF;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'save_shop_product: duplicate_size';
    END;
  END LOOP;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_tenant_id, auth.uid(), 'shop_product.saved', 'shop_product', v_id,
          p_product - 'image_path');

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION save_shop_product(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_shop_product(JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC (admin): delete an item. Returns its picture's path for the caller to
-- remove from storage. (Once families can order, an ordered item is hidden
-- instead; that rule arrives with the orders migration.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_shop_product(p_product_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row shop_products%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM shop_products WHERE id = p_product_id;
  IF NOT FOUND OR NOT photo_shop_is_admin(v_row.tenant_id) THEN
    RAISE EXCEPTION 'delete_shop_product: not_found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  DELETE FROM shop_products WHERE id = p_product_id;
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_row.tenant_id, auth.uid(), 'shop_product.deleted', 'shop_product', p_product_id,
          jsonb_build_object('name', v_row.name));
  RETURN v_row.image_path;
END;
$$;
REVOKE ALL ON FUNCTION delete_shop_product(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_shop_product(UUID) TO authenticated;
