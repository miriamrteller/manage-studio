-- =============================================================================
-- get_tenant_legal_profile() also returns tenants.teaches_classes.
--
-- The studio's legal documents follow it (owner decision): enrolment terms and
-- the class fields only when the studio teaches classes; dance wording only for
-- a dance studio that teaches classes. Same inputs, grants and tier (public);
-- one more column, so the function is dropped and recreated.
-- =============================================================================

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
  language_default           TEXT,
  legal_pack_ack_drafts      TEXT[],
  teaches_classes            BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.contact_email, t.skin, t.legal_profile,
         t.legal_pages_published, t.legal_profile_updated_at,
         t.legal_pack_required, t.legal_pack_acknowledged_at, t.language_default,
         t.legal_pack_ack_drafts, coalesce(t.teaches_classes, true)
  FROM tenants t
  WHERE t.id = p_tenant_id;
$$;
REVOKE ALL ON FUNCTION public.get_tenant_legal_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_legal_profile(UUID) TO anon, authenticated;
