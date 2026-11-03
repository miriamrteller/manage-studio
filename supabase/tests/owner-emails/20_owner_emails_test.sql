-- Platform owner emails (platform_owner_emails). Plain Postgres + the client-portal stub schema.
DO $$
DECLARE
  owner_id  UUID := 'b0000000-0000-4000-8000-0000000000e1';
  stranger  UUID := 'b0000000-0000-4000-8000-0000000000e3';
  member    UUID := 'b0000000-0000-4000-8000-0000000000e4';
  v_profile user_profiles%ROWTYPE;
  v_sub     TEXT;
  v_auth    TEXT;
BEGIN
  -- 1. The table holds both addresses; the helper normalises case and spaces.
  IF NOT is_platform_owner_email('  MiriamRTeller@Gmail.com ') THEN RAISE EXCEPTION 'FAIL old owner address not accepted'; END IF;
  IF NOT is_platform_owner_email('admin@opalswift.com') THEN RAISE EXCEPTION 'FAIL new owner address not accepted'; END IF;
  IF is_platform_owner_email('someone@example.test') OR is_platform_owner_email(NULL) OR is_platform_owner_email('') THEN
    RAISE EXCEPTION 'FAIL a non-owner address was accepted';
  END IF;
  RAISE NOTICE 'ok  both owner addresses accepted (case and spaces ignored); others and NULL are not';

  -- 2. Sign-up on the platform host with the CURRENT address: super_admin, no studio. A stranger gets nothing.
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (owner_id, 'MiriamRTeller@gmail.com', '{}'::jsonb);
  SELECT * INTO v_profile FROM user_profiles WHERE id = owner_id;
  IF NOT FOUND OR v_profile.tenant_id IS NOT NULL OR v_profile.role <> ARRAY['super_admin'] THEN
    RAISE EXCEPTION 'FAIL owner profile is wrong';
  END IF;
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (stranger, 'someone@example.test', '{}'::jsonb);
  IF EXISTS (SELECT 1 FROM user_profiles WHERE id = stranger) THEN RAISE EXCEPTION 'FAIL a stranger got a profile'; END IF;
  RAISE NOTICE 'ok  the owner gets a super_admin profile with no studio; a stranger gets none';

  -- 3. Nobody else can be given super_admin, and the owner profile cannot take a non-owner email.
  SELECT subdomain INTO v_sub FROM tenants LIMIT 1;
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (member, 'member@example.test', jsonb_build_object('subdomain', v_sub));
  BEGIN
    UPDATE user_profiles SET role = ARRAY['super_admin'] WHERE id = member;
    RAISE EXCEPTION 'FAIL a member was given super_admin';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%reserved for the platform owner%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE user_profiles SET email = 'member@example.test' WHERE id = owner_id;
    RAISE EXCEPTION 'FAIL the owner profile took a non-owner email';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%reserved for the platform owner%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  the guard still refuses super_admin for anyone but an owner address';

  -- 4. Changing the owner's login email to something that is NOT an owner address is refused as a whole.
  BEGIN
    UPDATE auth.users SET email = 'typo@example.test' WHERE id = owner_id;
    RAISE EXCEPTION 'FAIL the owner login was moved to a non-owner address';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%reserved for the platform owner%' THEN RAISE; END IF;
  END;
  SELECT lower(email) INTO v_auth FROM auth.users WHERE id = owner_id;
  IF v_auth <> 'miriamrteller@gmail.com' THEN RAISE EXCEPTION 'FAIL the failed change left the login at %', v_auth; END IF;
  RAISE NOTICE 'ok  a login change to a non-owner address is refused whole (the login stays as it was)';

  -- 5. THE SWITCH: the same account changes its login email to the new owner address. The profile
  --    follows, keeps super_admin and no studio: no lockout, same user id.
  UPDATE auth.users SET email = 'admin@opalswift.com' WHERE id = owner_id;
  SELECT * INTO v_profile FROM user_profiles WHERE id = owner_id;
  IF v_profile.email IS DISTINCT FROM 'admin@opalswift.com' THEN RAISE EXCEPTION 'FAIL profile email did not follow (%)', v_profile.email; END IF;
  IF v_profile.role <> ARRAY['super_admin'] OR v_profile.tenant_id IS NOT NULL THEN RAISE EXCEPTION 'FAIL the owner lost super_admin or gained a studio'; END IF;
  UPDATE user_profiles SET updated_at = now() WHERE id = owner_id;   -- a later profile write still works
  RAISE NOTICE 'ok  the owner changes login email; the profile follows and keeps super_admin (no lockout)';

  -- 6. Any other user's email change reaches their profile too (it never did).
  UPDATE auth.users SET email = 'member2@example.test' WHERE id = member;
  IF (SELECT email FROM user_profiles WHERE id = member) <> 'member2@example.test' THEN
    RAISE EXCEPTION 'FAIL a member email change did not reach the profile';
  END IF;
  RAISE NOTICE 'ok  any login-email change now syncs to the profile';

  -- 7. Release 2: the old address leaves the table. The owner (now on the new address) is unaffected;
  --    the old address no longer qualifies; a fresh sign-up with the new address still works.
  DELETE FROM platform_owner_emails WHERE email = 'miriamrteller@gmail.com';
  IF is_platform_owner_email('miriamrteller@gmail.com') THEN RAISE EXCEPTION 'FAIL removed address still accepted'; END IF;
  UPDATE user_profiles SET role = ARRAY['super_admin'] WHERE id = owner_id;
  DELETE FROM user_profiles WHERE id = owner_id;
  DELETE FROM auth.users WHERE id = owner_id;
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (owner_id, 'admin@opalswift.com', '{}'::jsonb);
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = owner_id AND role = ARRAY['super_admin']) THEN
    RAISE EXCEPTION 'FAIL fresh sign-up with the new address got no super_admin profile';
  END IF;
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('b0000000-0000-4000-8000-0000000000e5', 'miriamrteller@gmail.com', '{}'::jsonb);
  IF EXISTS (SELECT 1 FROM user_profiles WHERE id = 'b0000000-0000-4000-8000-0000000000e5') THEN
    RAISE EXCEPTION 'FAIL the removed address got a platform profile';
  END IF;
  RAISE NOTICE 'ok  after the old address is removed: the new one still works, the old one gets nothing';
END $$;

-- 8. Private: no client role can read the table or call the helper.
DO $$
BEGIN
  IF has_table_privilege('anon', 'platform_owner_emails', 'SELECT') OR has_table_privilege('authenticated', 'platform_owner_emails', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL a client role can read platform_owner_emails';
  END IF;
  IF has_function_privilege('anon', 'is_platform_owner_email(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'is_platform_owner_email(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'sync_profile_email_from_auth()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'sync_profile_email_from_auth()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL a client role can execute an owner-email function';
  END IF;
  RAISE NOTICE 'ok  no client role can read the owner emails or call the helpers';
END $$;
