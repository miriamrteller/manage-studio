-- "Change login email". Fixture: client-portal seed. Photo (…01) has admin …0e (admin@x.test);
-- Dance (…02) has parent Dina …0d (dina@x.test).
DO $$
DECLARE
  photo UUID := 'a0000000-0000-4000-8000-000000000001';
  admin UUID := 'b0000000-0000-4000-8000-00000000000e';
  dina  UUID := 'b0000000-0000-4000-8000-00000000000d';
  v TEXT;
BEGIN
  -- 1. The pre-send check.
  PERFORM set_config('request.jwt.claim.sub', admin::text, false);
  IF login_email_status('Admin@X.test') <> 'same' THEN RAISE EXCEPTION 'FAIL own login should be same'; END IF;
  IF login_email_status('dina@x.test') <> 'taken' THEN RAISE EXCEPTION 'FAIL another account should be taken'; END IF;
  IF login_email_status('admin@opalswift.com') <> 'reserved' THEN RAISE EXCEPTION 'FAIL owner email should be reserved'; END IF;
  IF login_email_status('new@lumen.test') <> 'ok' THEN RAISE EXCEPTION 'FAIL a free address should be ok'; END IF;
  RAISE NOTICE 'ok  login_email_status: same / taken / reserved / ok';

  PERFORM set_config('request.jwt.claim.sub', '', false);
  BEGIN
    PERFORM login_email_status('x@y.z');
    RAISE EXCEPTION 'FAIL anonymous caller got an answer';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF has_function_privilege('anon', 'login_email_status(text)', 'EXECUTE') THEN RAISE EXCEPTION 'FAIL anon can execute'; END IF;
  RAISE NOTICE 'ok  login_email_status is for signed-in users only';

  -- 2. A confirmed change: profile copies it; a separate business email stays.
  UPDATE tenants SET contact_email = 'studio@x.test' WHERE id = photo;
  UPDATE auth.users SET email = 'admin2@x.test', raw_user_meta_data = '{"business_email_follow": false}' WHERE id = admin;
  SELECT email INTO v FROM user_profiles WHERE id = admin;
  IF v <> 'admin2@x.test' THEN RAISE EXCEPTION 'FAIL profile not synced: %', v; END IF;
  SELECT contact_email INTO v FROM tenants WHERE id = photo;
  IF v <> 'studio@x.test' THEN RAISE EXCEPTION 'FAIL separate business email changed: %', v; END IF;
  RAISE NOTICE 'ok  confirmed change: profile follows; a separate business email is untouched';

  -- 3. With the tick: the studio's business email follows.
  UPDATE auth.users SET email = 'hello@lumen.test', raw_user_meta_data = '{"business_email_follow": true}' WHERE id = admin;
  SELECT contact_email INTO v FROM tenants WHERE id = photo;
  IF v <> 'hello@lumen.test' THEN RAISE EXCEPTION 'FAIL business email did not follow: %', v; END IF;
  RAISE NOTICE 'ok  "Also use this as my business email" sets the studio business email';

  -- 4. A parent (not a studio admin) with the flag never touches a studio.
  UPDATE auth.users SET email = 'dina2@x.test', raw_user_meta_data = '{"business_email_follow": true}' WHERE id = dina;
  IF (SELECT contact_email FROM tenants WHERE id = 'a0000000-0000-4000-8000-000000000002') = 'dina2@x.test' THEN
    RAISE EXCEPTION 'FAIL a parent changed the studio business email';
  END IF;
  RAISE NOTICE 'ok  a parent''s change never touches the studio';

  -- 5. A platform-owner address is refused for anyone else (the change rolls back).
  BEGIN
    UPDATE auth.users SET email = 'admin@opalswift.com' WHERE id = dina;
    RAISE EXCEPTION 'FAIL a parent took a platform-owner address';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'login_email_reserved' THEN RAISE; END IF;
  END;
  IF (SELECT email FROM auth.users WHERE id = dina) <> 'dina2@x.test' THEN RAISE EXCEPTION 'FAIL change not rolled back'; END IF;
  RAISE NOTICE 'ok  platform-owner addresses are refused';
END $$;
