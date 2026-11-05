-- =============================================================================
-- 20261104213750: the business email follows the login email while they match.
--
-- Studio profile now has "Same as my login email" (ticked when the business
-- email equals the admin's login). While it is ticked, the business email
-- follows the login, including after a confirmed login-email change. So when a
-- studio admin's login changes and the studio's business email (tenants.
-- contact_email) still equals the OLD login, it moves to the new one.
--
-- The "Also use this as my business email" tick box in the Change login email
-- window is gone. A change requested with it before this release
-- (user_metadata.business_email_follow = true) is still honoured.
--
-- Everything else in sync_profile_email_from_auth is unchanged (20261104120000).
-- =============================================================================

CREATE OR REPLACE FUNCTION sync_profile_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_profile user_profiles%ROWTYPE;
  v_found   BOOLEAN;
BEGIN
  SELECT * INTO v_profile FROM user_profiles WHERE id = NEW.id;
  v_found := FOUND;

  -- Platform-owner addresses belong to the platform owner only.
  IF is_platform_owner_email(NEW.email)
     AND NOT (v_found AND 'super_admin' = ANY(v_profile.role)) THEN
    RAISE EXCEPTION 'login_email_reserved' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE user_profiles
  SET email = NEW.email, updated_at = now()
  WHERE id = NEW.id AND email IS DISTINCT FROM NEW.email;

  -- A studio admin's business email follows the login while they match.
  IF v_found
     AND v_profile.tenant_id IS NOT NULL
     AND 'tenant_admin' = ANY(v_profile.role) THEN
    UPDATE tenants
    SET contact_email = NEW.email, updated_at = now()
    WHERE id = v_profile.tenant_id
      AND contact_email IS DISTINCT FROM NEW.email
      AND (lower(btrim(coalesce(contact_email, ''))) = lower(btrim(coalesce(OLD.email, '')))
           OR coalesce(NEW.raw_user_meta_data ->> 'business_email_follow', 'false') = 'true');
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION sync_profile_email_from_auth() FROM PUBLIC, anon, authenticated;
