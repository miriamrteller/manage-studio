-- =============================================================================
-- 001700: Storage buckets + policies
-- offering-images (public) — class card covers: {tenant_id}/{offering_id}/cover.webp
-- waiver-pdfs    (private) — signed waivers:   {tenant_id}/{person_id}/{evidence_id}.pdf
-- DEPENDENCIES: 000200, 000300, 000500
-- =============================================================================

-- ---------------------------------------------------------------------------
-- offering-images bucket (public read)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'offering-images',
  'offering-images',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read offering images"        ON storage.objects;
DROP POLICY IF EXISTS "Super admin select offering images" ON storage.objects;
DROP POLICY IF EXISTS "Super admin insert offering images" ON storage.objects;
DROP POLICY IF EXISTS "Super admin update offering images" ON storage.objects;
DROP POLICY IF EXISTS "Super admin delete offering images" ON storage.objects;
DROP POLICY IF EXISTS "Admins insert offering images"      ON storage.objects;
DROP POLICY IF EXISTS "Admins update offering images"      ON storage.objects;
DROP POLICY IF EXISTS "Admins delete offering images"      ON storage.objects;

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
      SELECT 1 FROM public.offerings o
      WHERE o.id = (storage.foldername(name))[2]::uuid
        AND o.tenant_id = public.get_my_tenant_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY "Admins update offering images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'offering-images'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1 FROM public.offerings o
      WHERE o.id = (storage.foldername(name))[2]::uuid
        AND o.tenant_id = public.get_my_tenant_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)
    )
  )
  WITH CHECK (
    bucket_id = 'offering-images'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND (storage.foldername(name))[3] = 'cover.webp'
    AND EXISTS (
      SELECT 1 FROM public.offerings o
      WHERE o.id = (storage.foldername(name))[2]::uuid
        AND o.tenant_id = public.get_my_tenant_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY "Admins delete offering images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'offering-images'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1 FROM public.offerings o
      WHERE o.id = (storage.foldername(name))[2]::uuid
        AND o.tenant_id = public.get_my_tenant_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)
    )
  );

-- ---------------------------------------------------------------------------
-- waiver-pdfs bucket (private — service_role writes; admins + owners read)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'waiver-pdfs',
  'waiver-pdfs',
  false,
  10485760,  -- 10 MB per PDF
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Service role manages waiver PDFs"   ON storage.objects;
DROP POLICY IF EXISTS "Admins read own tenant waiver PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Users read own waiver PDFs"         ON storage.objects;

CREATE POLICY "Service role manages waiver PDFs"
  ON storage.objects FOR ALL
  USING      (bucket_id = 'waiver-pdfs' AND public.is_service_role())
  WITH CHECK (bucket_id = 'waiver-pdfs' AND public.is_service_role());

CREATE POLICY "Admins read own tenant waiver PDFs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'waiver-pdfs'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY "Users read own waiver PDFs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'waiver-pdfs'
    AND (
      (storage.foldername(name))[2] = (
        SELECT person_id::text FROM public.user_profiles WHERE id = auth.uid()
      )
      OR (storage.foldername(name))[2] IN (
        SELECT p.id::text
        FROM public.people p
        WHERE p.tenant_id = public.get_my_tenant_id()
          AND p.account_id IN (
            SELECT account_id FROM public.account_members WHERE user_profile_id = auth.uid()
          )
      )
    )
  );
