-- =============================================================================
-- 002400: Tenant provisioning helpers — super_admin + self-service operator signup
-- check_subdomain_available: any authenticated user (used by signup wizard)
-- provision_tenant: moved to 003000 (needs tenant_plan ENUM + verticals table)
-- DEPENDENCIES: 000200
-- =============================================================================

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
  -- Any authenticated user may check availability (used by the operator signup wizard).
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_subdomain := lower(trim(p_subdomain));

  IF v_subdomain IS NULL OR v_subdomain = '' THEN
    RETURN FALSE;
  END IF;

  IF v_subdomain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM tenants t WHERE t.subdomain = v_subdomain
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_subdomain_available(TEXT) TO authenticated;

-- NOTE: provision_tenant is defined in 003000_feature_flag_system.sql
-- after tenant_plan ENUM, verticals table, and tenants.plan / tenants.skin columns exist.
