-- Add class cover images via Supabase Storage.
-- Uses canonical object path: {tenant_id}/{offering_id}/cover.webp

ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS cover_image_path TEXT;

COMMENT ON COLUMN offerings.cover_image_path IS
  'Supabase Storage path for class card cover image: {tenant_id}/{offering_id}/cover.webp';

ALTER TABLE offerings
  DROP CONSTRAINT IF EXISTS offerings_cover_image_path_format;

ALTER TABLE offerings
  ADD CONSTRAINT offerings_cover_image_path_format CHECK (
    cover_image_path IS NULL
    OR cover_image_path = tenant_id::text || '/' || id::text || '/cover.webp'
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'offering-images',
  'offering-images',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read offering images" ON storage.objects;
DROP POLICY IF EXISTS "Super admin select offering images" ON storage.objects;
DROP POLICY IF EXISTS "Super admin insert offering images" ON storage.objects;
DROP POLICY IF EXISTS "Super admin update offering images" ON storage.objects;
DROP POLICY IF EXISTS "Super admin delete offering images" ON storage.objects;
DROP POLICY IF EXISTS "Admins insert offering images" ON storage.objects;
DROP POLICY IF EXISTS "Admins update offering images" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete offering images" ON storage.objects;

CREATE POLICY "Public read offering images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'offering-images');

CREATE POLICY "Super admin select offering images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'offering-images' AND public.is_super_admin());

CREATE POLICY "Super admin insert offering images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'offering-images' AND public.is_super_admin());

CREATE POLICY "Super admin update offering images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'offering-images' AND public.is_super_admin())
  WITH CHECK (bucket_id = 'offering-images' AND public.is_super_admin());

CREATE POLICY "Super admin delete offering images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'offering-images' AND public.is_super_admin());

CREATE POLICY "Admins insert offering images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'offering-images'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND (storage.foldername(name))[3] = 'cover.webp'
    AND EXISTS (
      SELECT 1
      FROM public.offerings o
      WHERE o.id = (storage.foldername(name))[2]::uuid
        AND o.tenant_id = public.get_my_tenant_id()
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY "Admins update offering images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'offering-images'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1
      FROM public.offerings o
      WHERE o.id = (storage.foldername(name))[2]::uuid
        AND o.tenant_id = public.get_my_tenant_id()
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  )
  WITH CHECK (
    bucket_id = 'offering-images'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND (storage.foldername(name))[3] = 'cover.webp'
    AND EXISTS (
      SELECT 1
      FROM public.offerings o
      WHERE o.id = (storage.foldername(name))[2]::uuid
        AND o.tenant_id = public.get_my_tenant_id()
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY "Admins delete offering images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'offering-images'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1
      FROM public.offerings o
      WHERE o.id = (storage.foldername(name))[2]::uuid
        AND o.tenant_id = public.get_my_tenant_id()
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  );

-- Refresh public class RPC signature with image path + updated_at for cache busting.
DROP FUNCTION IF EXISTS get_public_offerings_by_subdomain(TEXT);

CREATE OR REPLACE FUNCTION get_public_offerings_by_subdomain(p_subdomain TEXT)
RETURNS TABLE (
  id                UUID,
  tenant_id         UUID,
  tenant_subdomain  TEXT,
  name              TEXT,
  day_of_week       INT,
  start_time        TIME,
  end_time          TIME,
  max_capacity      INT,
  min_age           INT,
  max_age           INT,
  price_minor       INT,
  currency          TEXT,
  season_id         UUID,
  season_start_date DATE,
  category_id       UUID,
  category_name     TEXT,
  status            TEXT,
  billing_mode      TEXT,
  billing_interval  TEXT,
  cover_image_path  TEXT,
  updated_at        TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_subdomain IS NULL OR trim(p_subdomain) = '' THEN
    RAISE EXCEPTION 'p_subdomain is required';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.tenant_id,
    t.subdomain,
    o.name,
    o.day_of_week,
    o.start_time,
    o.end_time,
    o.max_capacity,
    o.min_age,
    o.max_age,
    o.price_minor,
    o.currency,
    o.season_id,
    s.start_date AS season_start_date,
    o.category_id,
    c.name AS category_name,
    o.status,
    o.billing_mode,
    o.billing_interval,
    o.cover_image_path,
    o.updated_at
  FROM offerings o
  JOIN tenants t ON o.tenant_id = t.id
  LEFT JOIN seasons s ON s.id = o.season_id
  LEFT JOIN categories c ON c.id = o.category_id
  WHERE t.subdomain = trim(p_subdomain)
    AND o.is_public = true
    AND o.status    = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_offerings_by_subdomain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_public_offerings_by_subdomain(TEXT) TO authenticated;
