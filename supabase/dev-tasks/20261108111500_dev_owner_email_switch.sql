-- DEV ONLY (run by the dev-task workflow on the dev project, never on prod).
--
-- Gets the dev database past migration 20261104120500_platform_owner_release_2, which refuses to
-- run while any super_admin profile is not on admin@opalswift.com. Prod did this with the prod task
-- 20261103165643_owner_email_switch; dev never got it, so deploy-dev stopped at release 2.
--
-- Everything is found, not named (the repository is public). Each step prints its row count:
--   1. If no login has admin@opalswift.com yet and exactly one super_admin login is on another
--      owner address, move that login (its email identity, then the login) to admin@opalswift.com.
--      Same user id, password, sessions and confirmed date; the profile follows by trigger.
--   2. Any other super_admin profile not on admin@opalswift.com stops being the platform owner:
--      a profile in a studio keeps its studio roles and loses super_admin; an owner-only profile
--      (no studio, which cannot exist without super_admin) is deleted. Logins are kept.
--   3. If that leaves no super_admin, the login on admin@opalswift.com (if any) gets it.
--   4. Check: every super_admin is on admin@opalswift.com (the check release 2 makes), else the
--      whole file rolls back.

DO $$
BEGIN
  IF NOT is_platform_owner_email('admin@opalswift.com') THEN
    RAISE EXCEPTION 'dev_owner_email_switch: admin@opalswift.com is not in platform_owner_emails';
  END IF;
END $$;

-- 1a. The email identity of the one owner login to move.
WITH c AS (
  SELECT u.id FROM auth.users u JOIN public.user_profiles p ON p.id = u.id
  WHERE 'super_admin' = ANY (p.role) AND is_platform_owner_email(u.email)
    AND lower(u.email) <> 'admin@opalswift.com'
)
UPDATE auth.identities i
   SET identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb('admin@opalswift.com'::text)),
       provider_id = CASE WHEN lower(i.provider_id) = lower(u.email) THEN 'admin@opalswift.com' ELSE i.provider_id END,
       updated_at = now()
  FROM auth.users u
 WHERE i.user_id = u.id
   AND i.provider = 'email'
   AND u.id IN (SELECT id FROM c)
   AND (SELECT count(*) FROM c) = 1
   AND NOT EXISTS (SELECT 1 FROM auth.users x WHERE lower(x.email) = 'admin@opalswift.com');

-- 1b. The login itself (the profile follows).
WITH c AS (
  SELECT u.id FROM auth.users u JOIN public.user_profiles p ON p.id = u.id
  WHERE 'super_admin' = ANY (p.role) AND is_platform_owner_email(u.email)
    AND lower(u.email) <> 'admin@opalswift.com'
)
UPDATE auth.users u
   SET email = 'admin@opalswift.com', updated_at = now()
 WHERE u.id IN (SELECT id FROM c)
   AND (SELECT count(*) FROM c) = 1
   AND NOT EXISTS (SELECT 1 FROM auth.users x WHERE lower(x.email) = 'admin@opalswift.com');

-- 2a. Other owners that belong to a studio: keep the studio roles, lose super_admin.
UPDATE public.user_profiles p
   SET role = CASE WHEN array_remove(p.role, 'super_admin') = '{}'::text[] THEN ARRAY['account_holder']
                   ELSE array_remove(p.role, 'super_admin') END,
       updated_at = now()
 WHERE 'super_admin' = ANY (p.role)
   AND p.tenant_id IS NOT NULL
   AND (lower(p.email) <> 'admin@opalswift.com'
        OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id AND lower(u.email) <> 'admin@opalswift.com'));

-- 2b. Other owner-only profiles (no studio): deleted; the login stays.
DELETE FROM public.user_profiles p
 WHERE 'super_admin' = ANY (p.role)
   AND p.tenant_id IS NULL
   AND (lower(p.email) <> 'admin@opalswift.com'
        OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id AND lower(u.email) <> 'admin@opalswift.com'));

-- 3. Keep a platform owner on dev.
UPDATE public.user_profiles p
   SET role = array_append(p.role, 'super_admin'), updated_at = now()
  FROM auth.users u
 WHERE u.id = p.id
   AND lower(u.email) = 'admin@opalswift.com'
   AND lower(p.email) = 'admin@opalswift.com'
   AND NOT EXISTS (SELECT 1 FROM public.user_profiles x WHERE 'super_admin' = ANY (x.role));

-- 4. The same check release 2 makes.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.user_profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE 'super_admin' = ANY (p.role)
    AND (lower(p.email) <> 'admin@opalswift.com' OR (u.id IS NOT NULL AND lower(u.email) <> 'admin@opalswift.com'));
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'dev_owner_email_switch: % super_admin profile(s) still not on admin@opalswift.com', v_bad;
  END IF;
END $$;
