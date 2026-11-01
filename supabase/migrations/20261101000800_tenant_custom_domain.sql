-- Custom domain per tenant (docs/deployment/CUSTOM-DOMAIN.md).
--
-- The ballet school keeps its own website on creativeballetacademy.com; the app is served
-- on a hostname under the studio's domain, e.g. app.creativeballetacademy.com, in addition
-- to <subdomain>.opalswift.com (which keeps working).
--
-- 1. tenants.custom_domain: a full hostname (lower-case, no scheme, no path, no port).
--    Unique across tenants. NULL = no custom domain (every existing tenant).
-- 2. Only a super-admin, the service role or the SQL editor may set or change it; a tenant
--    admin cannot point their studio at a hostname (guard trigger below).
-- 3. get_tenant_config_by_host(p_host): the web app's lookup for hosts that are NOT under
--    the platform root domain. Returns exactly what get_tenant_config_by_subdomain returns
--    (it delegates to it, so the two can never drift). Tier "public".
--
-- Backward-compatible: one nullable column, one trigger, one new function. No data rewrites.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS custom_domain TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_custom_domain_shape_check') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_custom_domain_shape_check CHECK (
        custom_domain IS NULL
        OR (
          custom_domain = lower(custom_domain)
          AND length(custom_domain) <= 253
          AND custom_domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_custom_domain_key
  ON tenants (custom_domain) WHERE custom_domain IS NOT NULL;

COMMENT ON COLUMN tenants.custom_domain IS
  'Extra hostname that serves this tenant''s app, e.g. app.creativeballetacademy.com (lower-case host only). '
  'NULL = only <subdomain>.<root domain>. Tenant links in emails prefer it. Set by a super-admin only; '
  'DNS + Cloudflare steps in docs/deployment/CUSTOM-DOMAIN.md.';

-- Guard: tenant admins may update their tenant row (RLS), but never its custom_domain.
CREATE OR REPLACE FUNCTION guard_tenant_custom_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.custom_domain IS DISTINCT FROM OLD.custom_domain
     -- A request through the API carries JWT claims; the SQL editor and migrations do not.
     AND current_setting('request.jwt.claims', true) IS NOT NULL
     AND NOT is_service_role()
     AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'custom_domain can only be changed by a platform administrator'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_guard_custom_domain ON tenants;
CREATE TRIGGER tenants_guard_custom_domain
  BEFORE UPDATE OF custom_domain ON tenants
  FOR EACH ROW EXECUTE FUNCTION guard_tenant_custom_domain();

-- Same row shape as get_tenant_config_by_subdomain (20261101000600): it delegates to it.
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
  offline_payment_instructions      TEXT
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

-- Tier "public" in supabase/security/definer-execute.json (public tenant site).
REVOKE ALL ON FUNCTION get_tenant_config_by_host(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_tenant_config_by_host(TEXT) TO anon, authenticated, service_role;
