-- =============================================================================
-- get_tenant_config_by_subdomain — public tenant branding + Stripe publishable key
-- DEPENDS ON: 001 tenants
-- ACCESS: anon + authenticated via RPC; no direct table access for anon
-- =============================================================================

-- Replace previous unfiltered view with a subdomain-filtered SECURITY DEFINER RPC.
-- Only returns data for the requested subdomain — never exposes other tenants.
-- Never returns encrypted secret columns; uses boolean presence flags instead.

CREATE OR REPLACE FUNCTION get_tenant_config_by_subdomain(p_subdomain TEXT)
RETURNS TABLE (
  id                          UUID,
  name                        TEXT,
  tenant_subdomain            TEXT,
  language_default            TEXT,
  country                     TEXT,
  currency                    TEXT,
  vat_rate                    NUMERIC,
  primary_color               TEXT,
  accent_color                TEXT,
  stripe_publishable_key      TEXT,
  stripe_secret_configured    BOOLEAN,
  stripe_webhook_configured   BOOLEAN,
  stripe_credentials_updated_at TIMESTAMPTZ
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
    t.vat_rate,
    t.primary_color,
    t.accent_color,
    t.stripe_publishable_key,
    (t.stripe_secret_key_enc IS NOT NULL),
    (t.stripe_webhook_secret_enc IS NOT NULL),
    t.stripe_credentials_updated_at
  FROM tenants t
  WHERE t.subdomain = trim(p_subdomain)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO authenticated;
