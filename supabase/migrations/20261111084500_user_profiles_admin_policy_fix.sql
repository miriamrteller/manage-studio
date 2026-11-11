-- =============================================================================
-- 20261111084500: Fix the "admins manage profiles" policy on user_profiles.
--
-- The policy was
--   USING (tenant_id = get_my_tenant_id() AND 'tenant_admin' = ANY(role))
-- where `role` is the ROW's role, not the caller's. So any signed-in person of
-- a studio (a parent, a client) could read, edit or delete the studio admin's
-- profile row through the API, and deleting it locked the admin out. It also
-- meant admins could not manage the other profiles of their studio.
--
-- Now the CALLER must be a tenant_admin of the same studio. The check runs in a
-- SECURITY DEFINER helper so the policy does not query user_profiles under RLS
-- (that would recurse). Everyone keeps reading their own row ("users read own
-- profile"); the super_admin policy is unchanged.
-- ADDITIVE MIGRATION: one new helper, one policy replaced.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_my_studio_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT COALESCE((
    SELECT 'tenant_admin' = ANY(role) AND tenant_id IS NOT NULL
      FROM user_profiles WHERE id = auth.uid()), false)
$$;

COMMENT ON FUNCTION public.is_my_studio_admin() IS
  'True when the caller is a tenant_admin of their studio. RLS helper (runs as definer to avoid user_profiles policy recursion).';

-- RLS helper: policies run as the caller, so anon must be able to call it too
-- (it returns false for them).
REVOKE ALL ON FUNCTION public.is_my_studio_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_my_studio_admin() TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "admins manage profiles" ON public.user_profiles;
CREATE POLICY "admins manage profiles" ON public.user_profiles FOR ALL
  USING (tenant_id = (SELECT get_my_tenant_id()) AND (SELECT is_my_studio_admin()))
  WITH CHECK (tenant_id = (SELECT get_my_tenant_id()) AND (SELECT is_my_studio_admin()));
