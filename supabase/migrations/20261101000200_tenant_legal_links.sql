-- =============================================================================
-- Per-studio legal links (docs/legal/APP-GAPS.md, "Legal links").
--
-- Each studio has its own privacy policy, enrolment/booking terms and accessibility
-- statement (docs/legal 03, 07a/07c, 06). The app shows them in the tenant site's
-- footer and next to every public form that collects personal data. When a column is
-- NULL the app falls back to the platform URLs in VITE_PRIVACY_POLICY_URL /
-- VITE_TERMS_URL / VITE_ACCESSIBILITY_STATEMENT_URL.
--
-- Additive only: three nullable columns (https URLs), no data rewrites.
-- get_tenant_config_by_subdomain is redefined (return type grows); body otherwise
-- identical to 20261031000100. Grants match the 20261101000100 tier (anon +
-- authenticated): it is the public tenant lookup every page makes.
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS privacy_policy_url          TEXT,
  ADD COLUMN IF NOT EXISTS terms_url                   TEXT,
  ADD COLUMN IF NOT EXISTS accessibility_statement_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_legal_urls_https_check') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_legal_urls_https_check CHECK (
        (privacy_policy_url IS NULL OR privacy_policy_url ~ '^https://[^[:space:]]+$')
        AND (terms_url IS NULL OR terms_url ~ '^https://[^[:space:]]+$')
        AND (accessibility_statement_url IS NULL OR accessibility_statement_url ~ '^https://[^[:space:]]+$')
      );
  END IF;
END $$;

COMMENT ON COLUMN tenants.privacy_policy_url IS 'Studio privacy policy (https). Footer + next to public forms. NULL = platform VITE_PRIVACY_POLICY_URL.';
COMMENT ON COLUMN tenants.terms_url IS 'Studio enrolment/booking terms (https). Footer + required checkbox before payment. NULL = platform VITE_TERMS_URL.';
COMMENT ON COLUMN tenants.accessibility_statement_url IS 'Studio accessibility statement (https). Footer. NULL = platform VITE_ACCESSIBILITY_STATEMENT_URL.';

-- Public, non-secret values: readable like the other branding columns (002700 grants
-- tenants SELECT per column so *_enc stays hidden).
GRANT SELECT (privacy_policy_url, terms_url, accessibility_statement_url) ON TABLE public.tenants TO anon, authenticated;

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
  privacy_policy_url                TEXT,
  terms_url                         TEXT,
  accessibility_statement_url       TEXT
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
    t.privacy_policy_url,
    t.terms_url,
    t.accessibility_statement_url
  FROM tenants t
  WHERE t.subdomain = trim(p_subdomain)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO anon, authenticated;
