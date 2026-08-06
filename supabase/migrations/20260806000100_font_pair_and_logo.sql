-- DL-DESIGN-009: font_pair + logo columns + tenant-assets storage bucket

-- 1. Add columns to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS font_pair TEXT DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_dark_url TEXT;

-- 2. Supabase storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tenant-assets', 'tenant-assets', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 3. RLS on storage.objects for tenant-assets

-- Public read for all
DROP POLICY IF EXISTS "tenant-assets public read" ON storage.objects;
CREATE POLICY "tenant-assets public read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'tenant-assets');

-- Admin write: caller must be tenant_admin or super_admin, path must be under their tenant folder
DROP POLICY IF EXISTS "tenant-assets admin insert" ON storage.objects;
CREATE POLICY "tenant-assets admin insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'tenant-assets' AND
    (storage.foldername(name))[1]::uuid = get_my_tenant_id() AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
    )
  );

DROP POLICY IF EXISTS "tenant-assets admin update" ON storage.objects;
CREATE POLICY "tenant-assets admin update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'tenant-assets' AND
    (storage.foldername(name))[1]::uuid = get_my_tenant_id() AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
    )
  );

DROP POLICY IF EXISTS "tenant-assets admin delete" ON storage.objects;
CREATE POLICY "tenant-assets admin delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'tenant-assets' AND
    (storage.foldername(name))[1]::uuid = get_my_tenant_id() AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
    )
  );

-- ACTION REQUIRED: Update get_tenant_config_by_subdomain() RPC to also return font_pair, logo_url, logo_dark_url columns.
-- Add to RETURNS TABLE: font_pair TEXT, logo_url TEXT, logo_dark_url TEXT
-- Add to SELECT: t.font_pair, t.logo_url, t.logo_dark_url
