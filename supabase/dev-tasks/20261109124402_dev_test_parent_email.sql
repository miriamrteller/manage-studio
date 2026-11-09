-- DEV ONLY (run by the dev-task workflow on the dev project, never on prod).
--
-- The seed files now give the test parent the made-up address parent@ballet.test (the old one
-- was a real person's address, and the repository is public). This moves the dev database's
-- test-parent login to the new address so the documented dev login keeps working.
--
-- Everything is found, not named: the test parent is the login linked to the seeded person
-- 00000000-0000-0000-0000-000000000504 (Creative Ballet). Each step prints its row count:
--   1. That login's email identity, then the login itself, move to parent@ballet.test. Same user
--      id, password and sessions; the profile email follows by trigger.
--   2. The seeded person record's email follows.
--   3. Check: the login is on parent@ballet.test, else the whole file rolls back.
-- Not changed: the two seeded waiver_evidence rows keep the old signer email, because signed
-- evidence can never be edited (by design). They exist only in the dev database.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'parent@ballet.test'
             AND id NOT IN (SELECT p.id FROM public.user_profiles p
                            WHERE p.person_id = '00000000-0000-0000-0000-000000000504'::uuid)) THEN
    RAISE EXCEPTION 'dev_test_parent_email: parent@ballet.test already belongs to another login';
  END IF;
END $$;

-- 1a. The email identity of the test-parent login.
WITH c AS (
  SELECT u.id FROM auth.users u JOIN public.user_profiles p ON p.id = u.id
  WHERE p.person_id = '00000000-0000-0000-0000-000000000504'::uuid
    AND NOT ('super_admin' = ANY (p.role))
    AND lower(u.email) <> 'parent@ballet.test'
)
UPDATE auth.identities i
   SET identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb('parent@ballet.test'::text)),
       provider_id = CASE WHEN lower(i.provider_id) = lower(u.email) THEN 'parent@ballet.test' ELSE i.provider_id END,
       updated_at = now()
  FROM auth.users u
 WHERE i.user_id = u.id
   AND i.provider = 'email'
   AND u.id IN (SELECT id FROM c)
   AND (SELECT count(*) FROM c) = 1;

-- 1b. The login itself (the profile follows).
WITH c AS (
  SELECT u.id FROM auth.users u JOIN public.user_profiles p ON p.id = u.id
  WHERE p.person_id = '00000000-0000-0000-0000-000000000504'::uuid
    AND NOT ('super_admin' = ANY (p.role))
    AND lower(u.email) <> 'parent@ballet.test'
)
UPDATE auth.users u
   SET email = 'parent@ballet.test', updated_at = now()
 WHERE u.id IN (SELECT id FROM c)
   AND (SELECT count(*) FROM c) = 1;

-- 2. The seeded person record.
UPDATE public.people
   SET email = 'parent@ballet.test', updated_at = now()
 WHERE id = '00000000-0000-0000-0000-000000000504'::uuid
   AND email IS DISTINCT FROM 'parent@ballet.test';

-- 3. Check.
DO $$
DECLARE v_ok int;
BEGIN
  SELECT count(*) INTO v_ok
  FROM auth.users u JOIN public.user_profiles p ON p.id = u.id
  WHERE p.person_id = '00000000-0000-0000-0000-000000000504'::uuid
    AND lower(u.email) = 'parent@ballet.test'
    AND lower(p.email) = 'parent@ballet.test';
  IF v_ok <> 1 THEN
    RAISE EXCEPTION 'dev_test_parent_email: expected 1 test-parent login on parent@ballet.test, found %', v_ok;
  END IF;
END $$;
