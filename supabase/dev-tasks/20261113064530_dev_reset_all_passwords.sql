-- DEV ONLY (run by the dev-task workflow on the dev project, never on prod).
--
-- The owner asked for every dev login to have the same password, so she can sign in to the dev
-- website as any studio or role. The password is the documented dev password that every seed
-- file already uses (devPassword123, see supabase/seed*.sql and scripts/seed-dev.mjs). It is a
-- made-up test password, not a real one, and it only ever exists on the dev database.
--
-- Everything is found, not named (the repository is public). Each step prints its row count:
--   1. Every login that is not deleted and not anonymous gets the dev password. Email is marked
--      confirmed if it was not, and the four GoTrue token columns are set to '' where NULL
--      (GoTrue refuses password sign-in with "Database error querying schema" when they are NULL).
--   2. Any such login with no email identity gets one (same shape as the seed files make), since
--      a password sign-in needs it.
--   3. Check: every login now matches the dev password, else the whole file rolls back.
--   4. One SELECT per seeded test login (studio + role), to show which ones exist on dev,
--      then one SELECT listing all logins (only the count is shown).
-- Note: the base seed (seed.sql) gave its three studio owners 'devpassword' while every other seed
-- used 'devPassword123'. After this task every dev login uses devPassword123.
-- Nothing else changes: same user ids, emails, roles and studios.

-- 1. Same password for every login.
UPDATE auth.users u
   SET encrypted_password = extensions.crypt('devPassword123', extensions.gen_salt('bf')),
       email_confirmed_at = coalesce(u.email_confirmed_at, now()),
       confirmation_token = coalesce(u.confirmation_token, ''),
       recovery_token = coalesce(u.recovery_token, ''),
       email_change_token_new = coalesce(u.email_change_token_new, ''),
       email_change = coalesce(u.email_change, ''),
       updated_at = now()
 WHERE u.deleted_at IS NULL
   AND coalesce(u.is_anonymous, false) = false
   AND u.email IS NOT NULL;

-- 2. An email identity for any login that has none.
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', u.id::text, now(), now(), now()
  FROM auth.users u
 WHERE u.deleted_at IS NULL
   AND coalesce(u.is_anonymous, false) = false
   AND u.email IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email');

-- 3. Check.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
    FROM auth.users u
   WHERE u.deleted_at IS NULL
     AND coalesce(u.is_anonymous, false) = false
     AND u.email IS NOT NULL
     AND u.encrypted_password IS DISTINCT FROM extensions.crypt('devPassword123', u.encrypted_password);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'dev_reset_all_passwords: % login(s) still on another password', v_bad;
  END IF;
END $$;

-- 4. Which seeded test logins exist on dev, with the studio and role the seed files give them
--    (1 row = that login exists, belongs to that studio and has that role; 0 rows = not on dev).
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'admin@opalswift.com' AND t.subdomain = 'creativeballet' AND 'super_admin' = ANY (p.role);
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'parent@ballet.test' AND t.subdomain = 'creativeballet' AND 'account_holder' = ANY (p.role);
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'owner@ballet.test' AND t.subdomain = 'belladance' AND 'tenant_admin' = ANY (p.role);
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'owner@photo.test' AND t.subdomain = 'lensstudio' AND 'tenant_admin' = ANY (p.role);
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'owner@beauty.test' AND t.subdomain = 'velvetbeauty' AND 'tenant_admin' = ANY (p.role);
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'owner@artclass.test' AND t.subdomain = 'artclass' AND 'tenant_admin' = ANY (p.role);
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'owner@photographer.test' AND t.subdomain = 'photographer' AND 'tenant_admin' = ANY (p.role);
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'owner@sofer.test' AND t.subdomain = 'sofer' AND 'tenant_admin' = ANY (p.role);
SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE lower(u.email) = 'owner@therapist.test' AND t.subdomain = 'therapist' AND 'tenant_admin' = ANY (p.role);
-- 5. How many logins each studio has on dev (only the count is shown), so logins that are not in
--    the seed files show up as a difference from step 4.
SELECT u.id FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE t.subdomain = 'creativeballet' AND u.deleted_at IS NULL;
SELECT u.id FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE t.subdomain = 'belladance' AND u.deleted_at IS NULL;
SELECT u.id FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE t.subdomain = 'lensstudio' AND u.deleted_at IS NULL;
SELECT u.id FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE t.subdomain = 'velvetbeauty' AND u.deleted_at IS NULL;
SELECT u.id FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE t.subdomain = 'artclass' AND u.deleted_at IS NULL;
SELECT u.id FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE t.subdomain = 'photographer' AND u.deleted_at IS NULL;
SELECT u.id FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE t.subdomain = 'sofer' AND u.deleted_at IS NULL;
SELECT u.id FROM auth.users u JOIN public.user_profiles p ON p.id = u.id JOIN public.tenants t ON t.id = p.tenant_id
 WHERE t.subdomain = 'therapist' AND u.deleted_at IS NULL;
-- 6. Every login on dev (only the count is shown).
SELECT u.id FROM auth.users u
 WHERE u.deleted_at IS NULL AND coalesce(u.is_anonymous, false) = false AND u.email IS NOT NULL;
