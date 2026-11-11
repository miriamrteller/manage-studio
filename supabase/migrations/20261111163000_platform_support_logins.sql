-- =============================================================================
-- OpalSwift support logins (owner decision, 11 Nov 2026: "Yes, everything (logged)").
--
-- After the confirm step on a studio's address, the platform owner can do
-- everything that studio's own admin can, in that studio only, with every page
-- and change in the studio's OpalSwift access log.
--
-- How: each studio gets at most one "OpalSwift support" login, an ordinary
-- tenant_admin of that studio and nothing else. Only the platform-support-session
-- Edge Function makes it or signs into it, and only for the signed-in platform
-- owner (super_admin). So every existing admin check (RLS, definer functions,
-- Edge Functions) works unchanged and stays scoped to that one studio.
--
-- 1. user_profiles.is_platform_support marks it; one per studio.
-- 2. Nobody but the service role (that Edge Function) may make, change the
--    studio, role, email or flag of, or delete such a profile; and no other
--    profile may be given the flag. Its own harmless fields (e.g. language) may
--    change.
-- 3. platform_access_should_log(): also true for a support login, so its page
--    views and changes go into the studio's OpalSwift access log.
-- 4. Studio emails to "the studio's admins" leave support logins out (Edge
--    Functions filter on the flag).
-- =============================================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_platform_support BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.is_platform_support IS
  'The studio''s "OpalSwift support" login: the platform owner working in this studio after the confirm step. Made and opened only by the platform-support-session Edge Function. Left out of emails to the studio''s admins.';

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_platform_support_is_studio_admin;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_platform_support_is_studio_admin
  CHECK (NOT is_platform_support OR (tenant_id IS NOT NULL AND role = ARRAY['tenant_admin']::TEXT[]));

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_one_platform_support_per_studio
  ON public.user_profiles (tenant_id) WHERE is_platform_support;

-- ---------------------------------------------------------------------------
-- 2. Only the service role manages support profiles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_platform_support_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  -- Who is asking: the API role of the request (PostgREST sets it with SET ROLE,
  -- which a definer function does not change), else the connecting user
  -- (migrations, the auth server).
  v_caller TEXT := coalesce(nullif(current_setting('role', true), 'none'), session_user);
BEGIN
  -- The Edge Function (service role), migrations and maintenance.
  IF v_caller IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_platform_support THEN
      RAISE EXCEPTION 'platform support logins are made by OpalSwift only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Deleting the auth user (dashboard / auth admin API) removes its profile.
    IF OLD.is_platform_support AND v_caller IS DISTINCT FROM 'supabase_auth_admin' THEN
      RAISE EXCEPTION 'platform support logins are managed by OpalSwift only' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE (also blocks a login-email change, which the auth server copies here)
  IF NEW.is_platform_support IS DISTINCT FROM OLD.is_platform_support
     OR (OLD.is_platform_support AND (
          NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
          OR NEW.role IS DISTINCT FROM OLD.role
          OR NEW.email IS DISTINCT FROM OLD.email))
  THEN
    RAISE EXCEPTION 'platform support logins are managed by OpalSwift only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_platform_support_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_profiles_protect_platform_support ON public.user_profiles;
CREATE TRIGGER user_profiles_protect_platform_support
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_platform_support_profile();

-- ---------------------------------------------------------------------------
-- 3. The access log also covers support logins.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform_access_should_log(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_tenant_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM user_profiles up
       WHERE up.id = auth.uid()
         AND (
           ('super_admin' = ANY(up.role) AND up.tenant_id IS DISTINCT FROM p_tenant_id)
           OR (up.is_platform_support AND up.tenant_id = p_tenant_id)
         )
     )
$$;

REVOKE ALL ON FUNCTION platform_access_should_log(UUID) FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE platform_access_log IS
  'OpalSwift platform-owner access to a studio''s data: as super_admin, or through the studio''s OpalSwift support login. Append-only; kept 24 months. No personal data values.';

-- ---------------------------------------------------------------------------
-- For the Edge Function: a support login's auth user by its address (when an
-- earlier try made the auth user but stopped before the profile).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_support_auth_user_id(p_email TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT u.id FROM auth.users u
  WHERE lower(u.email) = lower(p_email)
    AND lower(p_email) LIKE 'support+%@opalswift.com'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.platform_support_auth_user_id(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_support_auth_user_id(TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- A support login never gets a password: it is opened only through the
-- confirm step (the Edge Function), never signed into directly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refuse_platform_support_password()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
     AND coalesce(NEW.encrypted_password, '') <> ''
     AND EXISTS (SELECT 1 FROM public.user_profiles WHERE id = NEW.id AND is_platform_support)
  THEN
    RAISE EXCEPTION 'platform support logins have no password' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_platform_support_password() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_platform_support_password ON auth.users;
CREATE TRIGGER on_auth_user_platform_support_password
  BEFORE UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.refuse_platform_support_password();
