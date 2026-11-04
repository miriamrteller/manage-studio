-- =============================================================================
-- 20261104205306: my_login_has_password() — does the signed-in person have a
-- login password yet?
--
-- After sign-in the app offers to set a password to anyone who has none (they
-- signed in by email link, code or Google). The browser cannot see this
-- itself, so this function answers true/false for the caller only. It never
-- returns the password hash or anything about anyone else.
--
-- ADDITIVE MIGRATION: one new function.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.my_login_has_password()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT u.encrypted_password IS NOT NULL AND u.encrypted_password <> ''
       FROM auth.users u
      WHERE u.id = auth.uid()),
    false
  );
$$;

COMMENT ON FUNCTION public.my_login_has_password() IS
  'True when the signed-in user has a login password. Caller only; returns no hash.';

REVOKE ALL ON FUNCTION public.my_login_has_password() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_login_has_password() TO authenticated;
