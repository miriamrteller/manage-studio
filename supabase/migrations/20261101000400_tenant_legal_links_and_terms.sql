-- Legal minimum on public forms (docs/legal/APP-GAPS.md, launch blocker 7).
--
-- 1. Per-tenant legal pages: privacy policy, enrolment terms and accessibility statement
--    URLs live on the tenant (one studio's policy must never show on another's site;
--    the VITE_* env vars stay for the OpalSwift root site only). Shown in the footer and
--    next to every public form that collects personal data (Privacy Protection Law §11).
-- 2. Enrolment terms acceptance: a required checkbox before payment (wording in
--    docs/legal/09-in-app-consent-texts.md §1) stores version, time and who accepted on
--    the engagement. tenants.enrolment_terms_version is the version shown to the parent;
--    bump it when the terms change.
-- 3. get_tenant_config_by_subdomain returns the new tenant fields.
--
-- Backward-compatible: nullable columns / defaults, extra return columns. No data rewrites.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS privacy_policy_url      TEXT,
  ADD COLUMN IF NOT EXISTS terms_url               TEXT,
  ADD COLUMN IF NOT EXISTS accessibility_url       TEXT,
  ADD COLUMN IF NOT EXISTS enrolment_terms_version TEXT NOT NULL DEFAULT '1';

COMMENT ON COLUMN tenants.privacy_policy_url IS
  'Studio privacy policy (docs/legal/03). Footer link + notice next to every public form. NULL = not published yet.';
COMMENT ON COLUMN tenants.terms_url IS
  'Studio enrolment terms (docs/legal/07a). Footer link + required checkbox before enrolment payment. NULL = no checkbox is shown.';
COMMENT ON COLUMN tenants.accessibility_url IS
  'Studio accessibility statement (docs/legal/06). Footer link. NULL = hidden.';
COMMENT ON COLUMN tenants.enrolment_terms_version IS
  'Version label of the enrolment terms the parent accepts (free text, e.g. 2026-11). Stored on engagements.terms_version.';

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS terms_accepted_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version             TEXT,
  ADD COLUMN IF NOT EXISTS terms_accepted_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS terms_accepted_by_email   TEXT,
  ADD COLUMN IF NOT EXISTS terms_accepted_via        TEXT
    CHECK (terms_accepted_via IS NULL OR terms_accepted_via IN ('parent', 'guest_link', 'admin_attested'));

COMMENT ON COLUMN engagements.terms_accepted_at IS
  'When the enrolment terms + privacy notice checkbox was ticked (accept-enrolment-terms). NULL = not yet.';
COMMENT ON COLUMN engagements.terms_version IS 'tenants.enrolment_terms_version at acceptance time.';
COMMENT ON COLUMN engagements.terms_accepted_by_user_id IS
  'auth user who ticked the box (signed-in parent, or the admin who attested). No FK: kept after the user is deleted.';
COMMENT ON COLUMN engagements.terms_accepted_by_email IS 'Email of the guest who ticked the box on the enrolment link.';
COMMENT ON COLUMN engagements.terms_accepted_via IS
  'parent = signed-in parent; guest_link = enrolment/pay link; admin_attested = admin confirmed the parent agreed (paper / in person).';

DROP FUNCTION IF EXISTS get_tenant_config_by_subdomain(TEXT);

CREATE OR REPLACE FUNCTION get_tenant_config_by_subdomain(p_subdomain TEXT)
RETURNS TABLE (
  id                                UUID,
  name                              TEXT,
  tenant_subdomain                  TEXT,
  language_default                  TEXT,
  country                           TEXT,
  currency                          TEXT,
  primary_color                     TEXT,
  accent_color                      TEXT,
  plan                              tenant_plan,
  skin                              TEXT,
  labels                            JSONB,
  payment_provider                  TEXT,
  invoicing_provider                TEXT,
  payment_provider_public_key            TEXT,
  payment_provider_secret_configured     BOOLEAN,
  payment_provider_webhook_configured    BOOLEAN,
  payment_provider_updated_at            TIMESTAMPTZ,
  enabled_features                  TEXT[],
  font_pair                         TEXT,
  logo_url                          TEXT,
  logo_dark_url                     TEXT,
  chrome_style                      TEXT,
  logo_tone                         JSONB,
  logo_dark_tone                    JSONB,
  logo_autofix                      BOOLEAN,
  offline_payment_instructions      TEXT,
  privacy_policy_url                TEXT,
  terms_url                         TEXT,
  accessibility_url                 TEXT,
  enrolment_terms_version           TEXT
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
    t.id,
    t.name,
    t.subdomain,
    t.language_default,
    t.country,
    t.currency,
    t.primary_color,
    t.accent_color,
    t.plan,
    t.skin,
    t.labels,
    t.payment_provider,
    t.invoicing_provider,
    t.payment_provider_public_key,
    (t.payment_provider_secret_enc  IS NOT NULL),
    (t.payment_provider_webhook_enc IS NOT NULL),
    t.payment_provider_updated_at,
    get_tenant_features(t.id),
    t.font_pair,
    t.logo_url,
    t.logo_dark_url,
    t.chrome_style,
    t.logo_tone,
    t.logo_dark_tone,
    t.logo_autofix,
    t.offline_payment_instructions,
    t.privacy_policy_url,
    t.terms_url,
    t.accessibility_url,
    t.enrolment_terms_version
  FROM tenants t
  WHERE t.subdomain = trim(p_subdomain)
  LIMIT 1;
END;
$$;

-- Tier "public" in supabase/security/definer-execute.json (public tenant site).
REVOKE ALL ON FUNCTION get_tenant_config_by_subdomain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO anon, authenticated, service_role;
