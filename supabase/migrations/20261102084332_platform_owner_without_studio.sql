-- =============================================================================
-- The platform owner can exist without a studio, and is the only account that can.
--
-- Production starts empty: no tenants, no users. The owner (miriamrteller@gmail.com,
-- reserved for super_admin by 20260827000100) must be able to sign in on the
-- platform host (app.opalswift.com) and create the first studio. Until now that was
-- impossible: user_profiles.tenant_id was NOT NULL, and handle_new_user() raised
-- "No tenant available" whenever there was no tenant, so no auth user could be
-- created at all (including from the Supabase dashboard).
--
-- 1. user_profiles.tenant_id may be NULL, but only on a super_admin profile.
--    get_my_tenant_id() is then NULL, so tenant-scoped policies match nothing for
--    that profile; the existing is_super_admin() policies give the owner access.
--    platform_access_should_log() already compares with IS DISTINCT FROM, so the
--    owner's writes to any studio are logged.
-- 2. handle_new_user():
--    - with a studio subdomain in the signup metadata: unchanged;
--    - without one: only the reserved owner email gets a profile, as super_admin
--      with no studio. Any other email is refused, so nobody can self-create an
--      account on the platform host. This also removes the old fallback that put
--      a subdomain-less signup into 'creativeballet' (or the first tenant).
-- =============================================================================

ALTER TABLE public.user_profiles ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_studio_or_platform_owner
  CHECK (tenant_id IS NOT NULL OR 'super_admin' = ANY (role));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id    UUID;
  v_subdomain    TEXT;
  v_email        TEXT;
  v_preset       TEXT;
  v_default_role TEXT[];
BEGIN
  v_subdomain := NULLIF(trim(NEW.raw_user_meta_data ->> 'subdomain'), '');
  v_email     := NEW.email;

  IF v_subdomain IS NULL THEN
    -- The platform host (no studio): only the platform owner may have an account here.
    IF lower(coalesce(v_email, '')) = 'miriamrteller@gmail.com' THEN
      INSERT INTO public.user_profiles (id, tenant_id, role, email, created_at, updated_at)
      VALUES (NEW.id, NULL, ARRAY['super_admin'], v_email, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        email      = EXCLUDED.email,
        updated_at = NOW();
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'A new account needs a studio. User ID: %', NEW.id;
  END IF;

  SELECT id, business_preset INTO v_tenant_id, v_preset FROM tenants WHERE subdomain = v_subdomain LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for subdomain: %. User ID: %, Email: %', v_subdomain, NEW.id, v_email;
  END IF;

  v_default_role := CASE COALESCE(v_preset, 'programs')
    WHEN 'catalog'  THEN ARRAY['customer']::TEXT[]
    WHEN 'services' THEN ARRAY['client']::TEXT[]
    ELSE ARRAY['account_holder']::TEXT[]
  END;

  INSERT INTO public.user_profiles (id, tenant_id, role, email, created_at, updated_at)
  VALUES (NEW.id, v_tenant_id, v_default_role, v_email, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error creating user_profiles for auth.users.id=%: %', NEW.id, SQLERRM;
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates the user_profiles row for a new auth user: in the studio named by raw_user_meta_data.subdomain, or, with no subdomain, only for the platform owner (super_admin, no studio). Any other subdomain-less signup is refused.';
