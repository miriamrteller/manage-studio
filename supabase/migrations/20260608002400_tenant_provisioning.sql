-- =============================================================================
-- 002400: Tenant provisioning helpers — self-service operator signup
-- is_reserved_subdomain: infrastructure hostnames that may never become tenants
-- check_subdomain_available: any authenticated user (used by signup wizard)
-- provision_tenant: final body in 002500_feature_flag_system.sql
-- DEPENDENCIES: 000200
-- =============================================================================

-- Hostnames that must never be claimed as a tenant subdomain.
--
-- `app.opalswift.com` serves the tenant-less shell (signup, post-payment
-- onboarding, session handoff); if a tenant could claim "app" it would shadow
-- that shell. The rest are infrastructure and RFC 2142 reserved names.
--
-- Mirrored in apps/web/src/lib/resolveTenantSubdomain.ts — keep both in sync.
CREATE OR REPLACE FUNCTION is_reserved_subdomain(p_subdomain TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(p_subdomain)) = ANY (ARRAY[
    -- platform / marketing
    'opalswift', 'www', 'app', 'api', 'admin', 'auth',
    -- infrastructure
    'mail', 'smtp', 'imap', 'ftp', 'cdn', 'static', 'assets', 'media',
    'dev', 'staging', 'test', 'qa', 'demo', 'preview',
    'status', 'docs', 'help', 'support', 'billing', 'account', 'blog',
    -- reserved by convention / RFC 2142
    'localhost', 'postmaster', 'webmaster', 'hostmaster', 'abuse', 'security'
  ]);
$$;

GRANT EXECUTE ON FUNCTION is_reserved_subdomain(TEXT) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION check_subdomain_available(p_subdomain TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_subdomain TEXT;
BEGIN
  -- Authenticated users (signup wizard) or service_role (server-side provisioning,
  -- where there is no auth.uid()).
  IF auth.uid() IS NULL AND current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_subdomain := lower(trim(p_subdomain));

  IF v_subdomain IS NULL OR v_subdomain = '' THEN
    RETURN FALSE;
  END IF;

  IF v_subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RETURN FALSE;
  END IF;

  IF is_reserved_subdomain(v_subdomain) THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM tenants t WHERE t.subdomain = v_subdomain
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_subdomain_available(TEXT) TO authenticated, service_role;

-- NOTE: provision_tenant is defined in 002500_feature_flag_system.sql
-- (tenant_plan + verticals already exist from 000200).
