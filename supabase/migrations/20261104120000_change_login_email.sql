-- =============================================================================
-- "Change login email" (Settings → Security; admins and the client/parent portals).
--
-- The change itself is Supabase's secure email change: it takes effect only after
-- both addresses confirm. This migration adds:
--
-- 1. login_email_status(p_email): what the form checks before sending, so it can
--    refuse in plain words: 'taken' (another account has it), 'reserved' (a
--    platform-owner address), 'same' (already your login) or 'ok'. Signed-in users only.
--
-- 2. The login-email sync trigger (on_auth_user_email_changed, from
--    20261103125417) now also:
--    - refuses a platform-owner address for anyone who is not the platform owner
--      (a backstop for the check above; the change is rolled back);
--    - when the person ticked "Also use this as my business email"
--      (user_metadata.business_email_follow = true, set with the request) and is a
--      studio admin, sets that studio's business email (tenants.contact_email)
--      to the new login, once the change is confirmed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.login_email_status(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_email = '' THEN
    RETURN 'invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND lower(email) = v_email) THEN
    RETURN 'same';
  END IF;
  IF is_platform_owner_email(v_email) THEN
    RETURN 'reserved';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email AND id <> auth.uid()) THEN
    RETURN 'taken';
  END IF;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.login_email_status(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.login_email_status(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION sync_profile_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_profile user_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM user_profiles WHERE id = NEW.id;

  -- Platform-owner addresses belong to the platform owner only.
  IF is_platform_owner_email(NEW.email)
     AND NOT (FOUND AND 'super_admin' = ANY(v_profile.role)) THEN
    RAISE EXCEPTION 'login_email_reserved' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE user_profiles
  SET email = NEW.email, updated_at = now()
  WHERE id = NEW.id AND email IS DISTINCT FROM NEW.email;

  -- "Also use this as my business email": a studio admin's studio follows the new login.
  IF FOUND
     AND v_profile.tenant_id IS NOT NULL
     AND 'tenant_admin' = ANY(v_profile.role)
     AND coalesce(NEW.raw_user_meta_data ->> 'business_email_follow', 'false') = 'true' THEN
    UPDATE tenants
    SET contact_email = NEW.email, updated_at = now()
    WHERE id = v_profile.tenant_id AND contact_email IS DISTINCT FROM NEW.email;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION sync_profile_email_from_auth() FROM PUBLIC, anon, authenticated;
