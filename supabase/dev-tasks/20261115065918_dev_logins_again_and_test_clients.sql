-- DEV ONLY (run by the dev-task workflow on the dev project, never on prod).
--
-- 1. The owner reports owner@photo.test with devPassword123 stopped working on dev after
--    20261113064530_dev_reset_all_passwords. Steps A1-A8 show, before anything changes, which part
--    of that login is wrong (1 row = yes, 0 rows = no). Nothing in them names data.
-- 2. The owner asked for one test client login per test studio, named like the owner logins:
--    client@ballet.test (belladance), client@photo.test (lensstudio), client@beauty.test
--    (velvetbeauty), client@artclass.test, client@photographer.test, client@sofer.test,
--    client@therapist.test. Each is a client record of that studio (person + billing account,
--    linked to the login, the way a booked client's login is linked), with password devPassword123.
-- 3. Every dev login again gets devPassword123, a confirmed email, '' token columns and an email
--    identity (as the earlier task). Support logins are skipped: they never have a password.
-- 4. Check, then one SELECT per test login (1 row = exists, in that studio, with that role).
-- Made-up .test addresses only (the repository is public).

-- A. Diagnose owner@photo.test as it is now.
SELECT 1 FROM auth.users WHERE lower(email) = 'owner@photo.test';                                     -- A1 exists
SELECT 1 FROM auth.users WHERE lower(email) = 'owner@photo.test' AND deleted_at IS NULL;              -- A2 not deleted
SELECT 1 FROM auth.users WHERE lower(email) = 'owner@photo.test'
   AND encrypted_password = extensions.crypt('devPassword123', encrypted_password);                   -- A3 password matches
SELECT 1 FROM auth.users WHERE lower(email) = 'owner@photo.test' AND email_confirmed_at IS NOT NULL;  -- A4 confirmed
SELECT 1 FROM auth.users WHERE lower(email) = 'owner@photo.test'
   AND (banned_until IS NULL OR banned_until < now());                                                -- A5 not banned
SELECT 1 FROM auth.users u JOIN auth.identities i ON i.user_id = u.id AND i.provider = 'email'
 WHERE lower(u.email) = 'owner@photo.test';                                                           -- A6 has email identity
SELECT 1 FROM auth.users u JOIN auth.identities i ON i.user_id = u.id AND i.provider = 'email'
 WHERE lower(u.email) = 'owner@photo.test' AND lower(i.identity_data->>'email') = 'owner@photo.test'; -- A7 identity email matches
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'owner@photo.test' AND t.subdomain = 'lensstudio' AND 'tenant_admin' = ANY (p.role); -- A8 lensstudio owner
-- A9 how many dev logins do not match devPassword123 right now
SELECT u.id FROM auth.users u
 WHERE u.deleted_at IS NULL AND coalesce(u.is_anonymous, false) = false AND u.email IS NOT NULL
   AND u.encrypted_password IS DISTINCT FROM extensions.crypt('devPassword123', u.encrypted_password);

-- B. One test client per test studio. The new-login trigger gives the profile the studio's
--    client role; the person, billing account and membership are linked to the login.
DO $$
DECLARE
  r RECORD;
  v_tenant UUID;
  v_uid UUID;
  v_person UUID;
  v_account UUID;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('client@ballet.test', 'belladance'), ('client@photo.test', 'lensstudio'),
      ('client@beauty.test', 'velvetbeauty'), ('client@artclass.test', 'artclass'),
      ('client@photographer.test', 'photographer'), ('client@sofer.test', 'sofer'),
      ('client@therapist.test', 'therapist')) AS w(email, sub)
  LOOP
    SELECT id INTO v_tenant FROM public.tenants WHERE subdomain = r.sub;
    CONTINUE WHEN v_tenant IS NULL;

    SELECT id INTO v_uid FROM auth.users WHERE lower(email) = r.email;
    IF v_uid IS NULL THEN
      v_uid := gen_random_uuid();
      INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, email_change, email_change_token_new, recovery_token)
      VALUES (v_uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
              r.email, extensions.crypt('devPassword123', extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('subdomain', r.sub),
              now(), now(), '', '', '', '');
    END IF;
    -- Only a login of this studio becomes its test client.
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = v_uid AND tenant_id = v_tenant);

    SELECT id INTO v_person FROM public.people
     WHERE tenant_id = v_tenant AND lower(email) = r.email ORDER BY created_at LIMIT 1;
    IF v_person IS NULL THEN
      INSERT INTO public.people (tenant_id, name, email, status, user_profile_id)
      VALUES (v_tenant, 'Test Client', r.email, 'active', v_uid)
      RETURNING id INTO v_person;
    ELSE
      UPDATE public.people SET user_profile_id = v_uid, updated_at = now()
       WHERE id = v_person AND user_profile_id IS NULL;
    END IF;

    SELECT account_id INTO v_account FROM public.people WHERE id = v_person;
    IF v_account IS NULL THEN
      INSERT INTO public.accounts (tenant_id, name, person_id)
      VALUES (v_tenant, 'Test Client', v_person)
      RETURNING id INTO v_account;
      UPDATE public.people SET account_id = v_account, updated_at = now() WHERE id = v_person;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.account_members WHERE account_id = v_account AND person_id = v_person) THEN
      INSERT INTO public.account_members (tenant_id, account_id, person_id, role, user_profile_id)
      VALUES (v_tenant, v_account, v_person, 'account_holder', v_uid);
    ELSE
      UPDATE public.account_members SET user_profile_id = v_uid
       WHERE account_id = v_account AND person_id = v_person AND user_profile_id IS NULL;
    END IF;

    UPDATE public.user_profiles SET person_id = v_person, updated_at = now()
     WHERE id = v_uid AND person_id IS NULL;
  END LOOP;
END $$;

-- C. Same password for every login (support logins have none, by design).
UPDATE auth.users u
   SET encrypted_password = extensions.crypt('devPassword123', extensions.gen_salt('bf')),
       email_confirmed_at = coalesce(u.email_confirmed_at, now()),
       banned_until = NULL,
       confirmation_token = coalesce(u.confirmation_token, ''),
       recovery_token = coalesce(u.recovery_token, ''),
       email_change_token_new = coalesce(u.email_change_token_new, ''),
       email_change = coalesce(u.email_change, ''),
       updated_at = now()
 WHERE u.deleted_at IS NULL
   AND coalesce(u.is_anonymous, false) = false
   AND u.email IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = u.id AND p.is_platform_support);

-- C2. An email identity for any login that has none.
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', u.id::text, now(), now(), now()
  FROM auth.users u
 WHERE u.deleted_at IS NULL
   AND coalesce(u.is_anonymous, false) = false
   AND u.email IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email');

-- D. Check.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
    FROM auth.users u
   WHERE u.deleted_at IS NULL
     AND coalesce(u.is_anonymous, false) = false
     AND u.email IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = u.id AND p.is_platform_support)
     AND u.encrypted_password IS DISTINCT FROM extensions.crypt('devPassword123', u.encrypted_password);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'dev_logins_again: % login(s) still on another password', v_bad;
  END IF;
END $$;

-- E. Each test login: 1 row = exists, in that studio, with that role (clients: linked client record).
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'admin@opalswift.com' AND t.subdomain = 'creativeballet' AND 'super_admin' = ANY (p.role);
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'parent@ballet.test' AND t.subdomain = 'creativeballet';
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE (lower(u.email), t.subdomain) IN (('owner@ballet.test', 'belladance'), ('owner@photo.test', 'lensstudio'),
       ('owner@beauty.test', 'velvetbeauty'), ('owner@artclass.test', 'artclass'),
       ('owner@photographer.test', 'photographer'), ('owner@sofer.test', 'sofer'),
       ('owner@therapist.test', 'therapist'))
   AND 'tenant_admin' = ANY (p.role);
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
  JOIN public.people pe ON pe.user_profile_id = u.id AND pe.tenant_id = t.id
 WHERE (lower(u.email), t.subdomain) IN (('client@ballet.test', 'belladance'), ('client@photo.test', 'lensstudio'),
       ('client@beauty.test', 'velvetbeauty'), ('client@artclass.test', 'artclass'),
       ('client@photographer.test', 'photographer'), ('client@sofer.test', 'sofer'),
       ('client@therapist.test', 'therapist'));
