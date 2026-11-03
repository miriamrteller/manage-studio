-- Moves the platform owner's sign-in from the current owner address to admin@opalswift.com.
-- The Supabase dashboard cannot change a user's email, so this is done here, once.
--
-- The owner is found, not named: the single user who holds the super_admin role and whose email is
-- a platform owner address (platform_owner_emails) other than the new one. The current address is
-- not written in this file (the repository is public).
--
-- Same user id, so nothing else changes: email_confirmed_at is kept, the password and sessions stay,
-- the super_admin profile stays. The auth.users email trigger copies the new address to
-- user_profiles. The old address stays in platform_owner_emails until release 2.
--
-- Expected row counts: auth.users UPDATE 1, auth.identities UPDATE 1, user_profiles already updated by
-- the trigger (checked below). Any other count raises and the whole file rolls back.
DO $$
DECLARE
  v_new   CONSTANT text := 'admin@opalswift.com';
  v_id    uuid;
  v_old   text;
  v_found int;
  v_rows  int;
BEGIN
  IF NOT is_platform_owner_email(v_new) THEN
    RAISE EXCEPTION 'owner_email_switch: % is not in platform_owner_emails yet (deploy release 1 first)', v_new;
  END IF;

  SELECT count(*) INTO v_found
  FROM auth.users u
  JOIN public.user_profiles p ON p.id = u.id
  WHERE 'super_admin' = ANY (p.role)
    AND is_platform_owner_email(u.email)
    AND lower(u.email) <> v_new;
  IF v_found <> 1 THEN
    RAISE EXCEPTION 'owner_email_switch: expected exactly 1 owner user to move, found %', v_found;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_new) THEN
    RAISE EXCEPTION 'owner_email_switch: another user already has the new address';
  END IF;

  SELECT u.id, u.email INTO v_id, v_old
  FROM auth.users u
  JOIN public.user_profiles p ON p.id = u.id
  WHERE 'super_admin' = ANY (p.role)
    AND is_platform_owner_email(u.email)
    AND lower(u.email) <> v_new;

  UPDATE auth.users
     SET email = v_new,
         updated_at = now()
   WHERE id = v_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'owner_email_switch: auth.users changed % rows, expected 1', v_rows;
  END IF;

  -- The email sign-in identity: its email lives in identity_data; provider_id is the email on older
  -- accounts and the user id on newer ones, so it is only moved when it holds the old address.
  UPDATE auth.identities
     SET identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_new)),
         provider_id = CASE WHEN lower(provider_id) = lower(v_old) THEN v_new ELSE provider_id END,
         updated_at = now()
   WHERE user_id = v_id
     AND provider = 'email';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'owner_email_switch: auth.identities changed % rows, expected 1', v_rows;
  END IF;

  SELECT count(*) INTO v_rows
  FROM public.user_profiles
  WHERE id = v_id AND lower(email) = v_new AND 'super_admin' = ANY (role);
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'owner_email_switch: user_profiles did not follow (% matching rows, expected 1)', v_rows;
  END IF;

  IF (SELECT email_confirmed_at FROM auth.users WHERE id = v_id) IS NULL THEN
    RAISE EXCEPTION 'owner_email_switch: email_confirmed_at was lost';
  END IF;
END $$;
