-- =============================================================================
-- The platform owner's email(s) live in ONE place: the platform_owner_emails table.
--
-- Until now the owner's address was written into two functions
-- (enforce_super_admin_reserved, handle_new_user) and into the web app. Moving the owner
-- to another address meant editing all of them, and a login-email change in Supabase Auth
-- did not reach user_profiles at all (nothing synced it), so the guard (which checks the
-- profile email AND the auth email) could have locked the owner out.
--
-- Release 1 (this migration): the table holds BOTH the old and the new owner address, the
-- guard and the sign-up trigger read it, and a login-email change now syncs to the profile.
-- The owner then changes her login email in the Supabase dashboard (same user id, profile
-- and history). Release 2 removes the old address from the table and from the repo.
--
-- Private by design: no client role can read the table or call the helper.
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform_owner_emails (
  email    TEXT        PRIMARY KEY
           CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note     TEXT
);
COMMENT ON TABLE platform_owner_emails IS
  'Login emails allowed to hold super_admin (the platform owner). Read only by enforce_super_admin_reserved and handle_new_user. Changing owners: edit this table in a migration, never by hand.';

ALTER TABLE platform_owner_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_owner_emails FROM PUBLIC, anon, authenticated;
GRANT ALL ON platform_owner_emails TO service_role;

-- Both addresses, so the switch cannot lock the owner out. Release 2 drops the first.
INSERT INTO platform_owner_emails (email, note) VALUES
  ('miriamrteller@gmail.com', 'previous owner address, removed in release 2'),
  ('admin@opalswift.com',     'platform owner')
ON CONFLICT (email) DO NOTHING;

CREATE OR REPLACE FUNCTION is_platform_owner_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_owner_emails
    WHERE email = lower(btrim(coalesce(p_email, '')))
  )
$$;
COMMENT ON FUNCTION is_platform_owner_email(TEXT) IS
  'True when the email is a platform owner address. Internal: used by triggers, not callable by clients.';
REVOKE ALL ON FUNCTION is_platform_owner_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION is_platform_owner_email(TEXT) TO service_role;

-- The guard: no path may grant super_admin to anyone but the owner. The profile's email must
-- be an owner address AND any linked auth.users row must agree.
CREATE OR REPLACE FUNCTION enforce_super_admin_reserved()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF 'super_admin' = ANY(NEW.role) THEN
    IF NOT is_platform_owner_email(NEW.email)
       OR EXISTS (
         SELECT 1 FROM auth.users u
         WHERE u.id = NEW.id AND NOT is_platform_owner_email(u.email)
       )
    THEN
      RAISE EXCEPTION 'super_admin is reserved for the platform owner';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Sign-up trigger: same as 20261102084332, with the owner check reading the table.
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
    IF is_platform_owner_email(v_email) THEN
      INSERT INTO public.user_profiles (id, tenant_id, role, email, created_at, updated_at)
      VALUES (NEW.id, NULL, ARRAY['super_admin'], v_email, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        email      = EXCLUDED.email,
        updated_at = NOW();
      RETURN NEW;
    END IF;
    -- Anyone else: no profile, so no studio and no access until a studio is
    -- provisioned for them (provision_tenant) or they sign up through a studio.
    RETURN NEW;
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

-- A login-email change now reaches the profile (it never did): audit_log.actor_email, admin
-- lists and the super_admin guard all read user_profiles.email. For the owner the new address
-- must be in platform_owner_emails, or the guard refuses the change as a whole.
CREATE OR REPLACE FUNCTION sync_profile_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE user_profiles
  SET email = NEW.email, updated_at = now()
  WHERE id = NEW.id AND email IS DISTINCT FROM NEW.email;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION sync_profile_email_from_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION sync_profile_email_from_auth();
