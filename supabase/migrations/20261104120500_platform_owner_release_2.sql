-- Release 2 of the platform owner's email switch: only admin@opalswift.com stays in
-- platform_owner_emails. The previous owner address is removed (it is found, not named, because the
-- repository is public: it is every row except the new owner address).
--
-- Safe by construction: this refuses to run unless the single super_admin already signs in with the
-- new address (both the profile and the login), so the owner can never be locked out. Run after the
-- owner confirmed signing in with admin@opalswift.com (release 1 + the owner_email_switch prod task).
DO $$
DECLARE
  v_new CONSTANT text := 'admin@opalswift.com';
  v_bad int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_owner_emails WHERE email = v_new) THEN
    RAISE EXCEPTION 'owner_release_2: % is not in platform_owner_emails', v_new;
  END IF;

  -- Every super_admin profile must already be on the new address, in the profile and the login.
  SELECT count(*) INTO v_bad
  FROM public.user_profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE 'super_admin' = ANY (p.role)
    AND (lower(p.email) <> v_new OR (u.id IS NOT NULL AND lower(u.email) <> v_new));
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'owner_release_2: % super_admin profile(s) are not on % yet; run the owner_email_switch prod task first', v_bad, v_new;
  END IF;

  DELETE FROM platform_owner_emails WHERE email <> v_new;
END $$;

COMMENT ON TABLE platform_owner_emails IS
  'Login emails allowed to hold super_admin (the platform owner). Read only by enforce_super_admin_reserved and handle_new_user. Changing owners: edit this table in a migration, never by hand.';
