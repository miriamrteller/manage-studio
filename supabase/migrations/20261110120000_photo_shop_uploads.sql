-- =============================================================================
-- 20261110120000: Photo shop — the studio uploads its own preview photos.
--
-- Owner decision (10 Nov 2026): instead of connecting SmugMug, the photographer
-- uploads the shoot's photos. Her browser shrinks each photo and stamps the
-- watermark BEFORE upload, so originals never leave her computer; OpalSwift
-- only ever holds low-res watermarked previews.
--
--   * job_photo_shops.provider gains 'upload' and becomes the default.
--   * job_photo_shop_photos — one row per uploaded preview. The row id is the
--     photo's image_key in orders; file_name is the photographer's own file
--     name (e.g. IMG_0423.jpg) so she can find the original to edit.
--   * Storage bucket 'photo-shop-photos' (private): <tenant>/<shoot>/<uuid>.jpg.
--     Studio admins upload, read and delete their own; clients only ever get
--     short-lived signed URLs from the client-photo-shop Edge Function.
--   * add_job_photo_shop_photos / delete_job_photo_shop_photo (admin RPCs).
--     The first upload saves the shop (prefilled) and opens its gallery.
--
-- ADDITIVE MIGRATION: one CHECK widened, a column default and one function
-- body changed (prefill provider), new table, bucket, policies and RPCs.
-- DEPENDENCIES: 20261104171055 (photo shop)
-- =============================================================================

ALTER TABLE job_photo_shops DROP CONSTRAINT IF EXISTS job_photo_shops_provider_check;
ALTER TABLE job_photo_shops ADD CONSTRAINT job_photo_shops_provider_check
  CHECK (provider IN ('smugmug', 'mock', 'upload'));
ALTER TABLE job_photo_shops ALTER COLUMN provider SET DEFAULT 'upload';
COMMENT ON COLUMN job_photo_shops.gallery_key IS
  'The gallery id: for uploads the shoot''s engagement id (set by the first upload); for SmugMug the album key. NULL = no photos yet.';

-- New shops start on uploads.
CREATE OR REPLACE FUNCTION photo_shop_prefill(p_engagement_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'engagement_id',          e.id,
    'tenant_id',              e.tenant_id,
    'provider',               'upload',
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
-- Uploaded previews
-- ---------------------------------------------------------------------------
CREATE TABLE job_photo_shop_photos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id),
  engagement_id  UUID        NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  storage_path   TEXT        NOT NULL UNIQUE,
  file_name      TEXT        NOT NULL CHECK (char_length(trim(file_name)) BETWEEN 1 AND 255),
  position       INT         NOT NULL DEFAULT 0,
  created_by     UUID        REFERENCES user_profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE job_photo_shop_photos IS
  'Low-res watermarked previews the studio uploaded for a shoot''s photo shop. id = image_key in orders; file_name = the photographer''s own file name.';

CREATE INDEX idx_job_photo_shop_photos_engagement ON job_photo_shop_photos(engagement_id, position);
CREATE INDEX idx_job_photo_shop_photos_tenant ON job_photo_shop_photos(tenant_id);
CREATE INDEX idx_job_photo_shop_photos_created_by ON job_photo_shop_photos(created_by);

ALTER TABLE job_photo_shop_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_photo_shop_photos_super_admin ON job_photo_shop_photos FOR ALL USING (is_super_admin());
CREATE POLICY job_photo_shop_photos_admin_select ON job_photo_shop_photos FOR SELECT
  TO authenticated
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = (select auth.uid()) AND 'tenant_admin' = ANY(role)));
GRANT SELECT ON TABLE job_photo_shop_photos TO authenticated;
GRANT ALL ON TABLE job_photo_shop_photos TO service_role;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, studio admins manage their own shoots' folders
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photo-shop-photos',
  'photo-shop-photos',
  false,
  3145728,  -- 3 MB: previews are shrunk in the browser to about 200 KB
  ARRAY['image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins upload photo shop photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins read photo shop photos"   ON storage.objects;
DROP POLICY IF EXISTS "Admins delete photo shop photos" ON storage.objects;

CREATE POLICY "Admins upload photo shop photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'photo-shop-photos'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1 FROM public.engagements e
      WHERE e.id::text = (storage.foldername(name))[2]
        AND e.tenant_id = public.get_my_tenant_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = (select auth.uid()) AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY "Admins read photo shop photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'photo-shop-photos'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = (select auth.uid()) AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY "Admins delete photo shop photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'photo-shop-photos'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = (select auth.uid()) AND 'tenant_admin' = ANY(role)
    )
  );

-- ---------------------------------------------------------------------------
-- RPC (admin): register uploaded previews. The first upload saves the shop
-- (prefilled from the package and studio defaults) and opens its gallery.
--   p_photos: [{"path":"<tenant>/<shoot>/<uuid>.jpg","file_name":"IMG_0423.jpg"}, ...]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_job_photo_shop_photos(p_engagement_id UUID, p_photos JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id UUID;
  v_prefix    TEXT;
  v_next      INT;
  v_item      JSONB;
  v_path      TEXT;
  v_name      TEXT;
  v_added     INT := 0;
  v_shop      JSONB;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM engagements WHERE id = p_engagement_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'add_job_photo_shop_photos: job not found';
  END IF;
  IF NOT photo_shop_is_admin(v_tenant_id) THEN
    RAISE EXCEPTION 'add_job_photo_shop_photos: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_photos IS NULL OR jsonb_typeof(p_photos) <> 'array' OR jsonb_array_length(p_photos) = 0 THEN
    RAISE EXCEPTION 'add_job_photo_shop_photos: no_photos';
  END IF;
  IF jsonb_array_length(p_photos) > 500 THEN
    RAISE EXCEPTION 'add_job_photo_shop_photos: too_many_photos';
  END IF;

  v_prefix := v_tenant_id::text || '/' || p_engagement_id::text || '/';
  SELECT COALESCE(MAX(position), 0) INTO v_next FROM job_photo_shop_photos WHERE engagement_id = p_engagement_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_photos) LOOP
    v_path := v_item->>'path';
    v_name := left(trim(COALESCE(v_item->>'file_name', '')), 255);
    -- Only this shoot's own folder, one flat .jpg per photo.
    IF v_path IS NULL OR v_path NOT LIKE v_prefix || '%' OR v_path !~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.jpg$' THEN
      RAISE EXCEPTION 'add_job_photo_shop_photos: bad_path';
    END IF;
    IF v_name = '' THEN
      v_name := regexp_replace(v_path, '^.*/', '');
    END IF;
    INSERT INTO job_photo_shop_photos (tenant_id, engagement_id, storage_path, file_name, position, created_by)
    VALUES (v_tenant_id, p_engagement_id, v_path, v_name, v_next + 1, auth.uid())
    ON CONFLICT (storage_path) DO NOTHING;
    IF FOUND THEN
      v_next := v_next + 1;
      v_added := v_added + 1;
    END IF;
  END LOOP;

  -- Save the shop if needed, and point its gallery at the uploads.
  IF NOT EXISTS (SELECT 1 FROM job_photo_shops WHERE engagement_id = p_engagement_id) THEN
    v_shop := photo_shop_prefill(p_engagement_id);
    INSERT INTO job_photo_shops (
      engagement_id, tenant_id, provider, gallery_key, included_photos,
      price_per_photo_minor, all_photos_price_minor, currency, closes_at
    ) VALUES (
      p_engagement_id, v_tenant_id, 'upload', p_engagement_id::text,
      COALESCE((v_shop->>'included_photos')::INT, 0),
      (v_shop->>'price_per_photo_minor')::INT,
      (v_shop->>'all_photos_price_minor')::INT,
      v_shop->>'currency',
      (v_shop->>'closes_at')::TIMESTAMPTZ
    );
  ELSE
    UPDATE job_photo_shops
       SET provider = 'upload', gallery_key = p_engagement_id::text
     WHERE engagement_id = p_engagement_id
       AND (provider <> 'upload' OR gallery_key IS DISTINCT FROM p_engagement_id::text);
  END IF;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_tenant_id, auth.uid(), 'job_photo_shop.photos_added', 'engagement', p_engagement_id,
          jsonb_build_object('added', v_added));

  RETURN jsonb_build_object('added', v_added);
END;
$$;
REVOKE ALL ON FUNCTION add_job_photo_shop_photos(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION add_job_photo_shop_photos(UUID, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC (admin): remove a preview. A photo a client has bought (or is paying
-- for) stays, so the order keeps its thumbnail. Returns the storage path for
-- the caller to delete the file.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_job_photo_shop_photo(p_photo_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_photo job_photo_shop_photos%ROWTYPE;
BEGIN
  SELECT * INTO v_photo FROM job_photo_shop_photos WHERE id = p_photo_id;
  IF NOT FOUND OR NOT photo_shop_is_admin(v_photo.tenant_id) THEN
    RAISE EXCEPTION 'delete_job_photo_shop_photo: not_found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (
    SELECT 1 FROM job_photo_order_items i
    WHERE i.engagement_id = v_photo.engagement_id AND i.image_key = v_photo.id::text AND i.voided_at IS NULL
  ) THEN
    RAISE EXCEPTION 'delete_job_photo_shop_photo: already_bought';
  END IF;

  DELETE FROM job_photo_shop_photos WHERE id = p_photo_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_photo.tenant_id, auth.uid(), 'job_photo_shop.photo_deleted', 'engagement', v_photo.engagement_id,
          jsonb_build_object('photo_id', v_photo.id, 'file_name', v_photo.file_name));

  RETURN v_photo.storage_path;
END;
$$;
REVOKE ALL ON FUNCTION delete_job_photo_shop_photo(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_job_photo_shop_photo(UUID) TO authenticated;
