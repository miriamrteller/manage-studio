-- Studio legal pack: every new studio's legal documents are drafts until its
-- admin acknowledges them ("I understand these are draft documents …").
--
-- * tenants.legal_pack_required: TRUE for studios created on or after
--   2026-11-02 (production's first real studios) and every new one; FALSE for
--   older rows (dev seeds and test studios).
-- * Until a required studio acknowledges, its public legal pages show "not
--   published yet" and its signing flows (get-waiver-engagement, accept-waiver)
--   refuse with studio_legal_not_ready.
-- * acknowledge_studio_legal_pack() records the acknowledgement in
--   legal_acceptances (append-only; user, time, version) and publishes the
--   pages. It refuses a studio whose type needs a signed form (dance: health
--   declaration; photographer: shoot agreement) while none is active. The form
--   itself is seeded when the studio is created (provision-studio).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS legal_pack_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_pack_acknowledged_at TIMESTAMPTZ;
UPDATE public.tenants SET legal_pack_required = true WHERE created_at >= '2026-11-02';
ALTER TABLE public.tenants ALTER COLUMN legal_pack_required SET DEFAULT true;

COMMENT ON COLUMN public.tenants.legal_pack_required IS
  'True for studios created after the legal pack shipped: public legal pages and signing wait for legal_pack_acknowledged_at.';
COMMENT ON COLUMN public.tenants.legal_pack_acknowledged_at IS
  'When a studio admin acknowledged the draft legal pack (acknowledge_studio_legal_pack). Evidence is in legal_acceptances.';

ALTER TABLE public.legal_acceptances DROP CONSTRAINT IF EXISTS legal_acceptances_document_check;
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_document_check
  CHECK (document IN (
    'platform_terms', 'dpa', 'opalswift_privacy',
    'enrolment_terms', 'studio_privacy',
    'studio_legal_pack'
  ));

CREATE OR REPLACE FUNCTION public.acknowledge_studio_legal_pack(
  p_version  TEXT,
  p_language TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_tenant  UUID;
  v_headers JSONB;
  v_ip      INET;
  v_ua      TEXT;
  v_now     TIMESTAMPTZ := now();
BEGIN
  SELECT up.tenant_id INTO v_tenant
  FROM user_profiles up
  WHERE up.id = v_uid AND up.tenant_id IS NOT NULL AND 'tenant_admin' = ANY (up.role);
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'only a studio admin can acknowledge the legal pack';
  END IF;
  IF p_version IS NULL OR length(trim(p_version)) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'version is required';
  END IF;
  IF p_language NOT IN ('he', 'en') THEN
    RAISE EXCEPTION 'language must be he or en';
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  IF v_headers IS NOT NULL THEN
    BEGIN
      v_ip := split_part(coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-forwarded-for', ''), ',', 1)::inet;
    EXCEPTION WHEN others THEN
      v_ip := NULL;
    END;
    v_ua := left(v_headers->>'user-agent', 512);
  END IF;

  INSERT INTO legal_acceptances (tenant_id, user_id, document, document_version, language, accepted_by_role, ip_address, user_agent)
  VALUES (v_tenant, v_uid, 'studio_legal_pack', trim(p_version), p_language, 'tenant_admin', v_ip, v_ua);

  -- A studio whose clients sign a form cannot go live without one.
  IF (SELECT skin FROM tenants WHERE id = v_tenant) IN ('dance-studio', 'photographer')
     AND NOT EXISTS (SELECT 1 FROM consent_templates ct WHERE ct.tenant_id = v_tenant AND ct.status = 'active') THEN
    RAISE EXCEPTION 'signed_template_missing';
  END IF;

  UPDATE tenants
  SET legal_pack_acknowledged_at = v_now, legal_pages_published = true
  WHERE id = v_tenant;

  RETURN v_now;
END;
$$;

COMMENT ON FUNCTION public.acknowledge_studio_legal_pack(TEXT, TEXT) IS
  'A studio admin acknowledges the draft legal pack: records it and publishes the legal pages. Refuses while a required signed form is missing.';

REVOKE ALL ON FUNCTION public.acknowledge_studio_legal_pack(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_studio_legal_pack(TEXT, TEXT) TO authenticated;

-- The public legal pages need the gate too (and the pack needs the studio's
-- language): same function, three more columns.
DROP FUNCTION IF EXISTS public.get_tenant_legal_profile(UUID);
CREATE FUNCTION public.get_tenant_legal_profile(p_tenant_id UUID)
RETURNS TABLE (
  tenant_id                  UUID,
  name                       TEXT,
  contact_email              TEXT,
  skin                       TEXT,
  legal_profile              JSONB,
  legal_pages_published      BOOLEAN,
  legal_profile_updated_at   TIMESTAMPTZ,
  legal_pack_required        BOOLEAN,
  legal_pack_acknowledged_at TIMESTAMPTZ,
  language_default           TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.contact_email, t.skin, t.legal_profile,
         t.legal_pages_published, t.legal_profile_updated_at,
         t.legal_pack_required, t.legal_pack_acknowledged_at, t.language_default
  FROM tenants t
  WHERE t.id = p_tenant_id;
$$;
REVOKE ALL ON FUNCTION public.get_tenant_legal_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_legal_profile(UUID) TO anon, authenticated;
