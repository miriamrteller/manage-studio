-- =============================================================================
-- The tenant site config also returns the business profile (payment flow and the
-- three switches), so the app can pick general wording and menus without a second
-- request. Public, like the rest of this row: none of it is sensitive.
-- get_tenant_config_by_host delegates to by_subdomain and must return the same columns.
-- =============================================================================
DROP FUNCTION IF EXISTS get_tenant_config_by_host(TEXT);
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
  accessibility_statement_url       TEXT,
  offline_payment_instructions      TEXT,
  payment_flow                      TEXT,
  teaches_classes                   BOOLEAN,
  family_accounts                   BOOLEAN,
  client_booking                    BOOLEAN
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
    t.accessibility_statement_url,
    t.offline_payment_instructions,
    t.payment_flow,
    t.teaches_classes,
    t.family_accounts,
    t.client_booking
  FROM tenants t
  WHERE t.subdomain = trim(p_subdomain)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION get_tenant_config_by_subdomain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION get_tenant_config_by_host(p_host TEXT)
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
  accessibility_statement_url       TEXT,
  offline_payment_instructions      TEXT,
  payment_flow                      TEXT,
  teaches_classes                   BOOLEAN,
  family_accounts                   BOOLEAN,
  client_booking                    BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host      TEXT;
  v_subdomain TEXT;
BEGIN
  v_host := lower(trim(coalesce(p_host, '')));
  -- Tolerate a port and a trailing dot from the browser's location.host.
  v_host := regexp_replace(v_host, ':[0-9]+$', '');
  v_host := regexp_replace(v_host, '\.$', '');
  IF v_host = '' THEN
    RAISE EXCEPTION 'p_host is required';
  END IF;

  SELECT t.subdomain INTO v_subdomain
  FROM tenants t
  WHERE t.custom_domain = v_host
  LIMIT 1;

  IF v_subdomain IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM get_tenant_config_by_subdomain(v_subdomain);
END;
$$;

COMMENT ON FUNCTION get_tenant_config_by_host(TEXT) IS
  'Tenant config for a custom hostname (tenants.custom_domain); same columns as get_tenant_config_by_subdomain. '
  'Empty result when no tenant owns the host. Public tier: the tenant site loads it before sign-in.';

REVOKE ALL ON FUNCTION get_tenant_config_by_host(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_tenant_config_by_host(TEXT) TO anon, authenticated, service_role;
