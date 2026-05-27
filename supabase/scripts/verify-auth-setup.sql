-- Auth + profile linkage checks for magic-link login testing
-- Run after migrations + seed.sql (+ seed-auth-parent.mjs on hosted)
-- Usage: psql $DATABASE_URL -f supabase/scripts/verify-auth-setup.sql

\set parent_email 'miriamrstern@gmail.com'
\set parent_user_id '00000000-0000-0000-0000-000000000510'

DO $$
DECLARE
  v_auth_count INT;
  v_profile_count INT;
  v_family_links INT;
  v_trigger_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_auth_count
  FROM auth.users
  WHERE email = 'miriamrstern@gmail.com';

  IF v_auth_count = 0 THEN
    RAISE EXCEPTION 'FAIL: no auth.users row for %. Run seed-auth-parent.mjs (hosted) or db:reset-local (local).', 'miriamrstern@gmail.com';
  END IF;
  RAISE NOTICE 'PASS: auth.users exists for %', 'miriamrstern@gmail.com';

  SELECT COUNT(*) INTO v_profile_count
  FROM user_profiles
  WHERE id = '00000000-0000-0000-0000-000000000510'::uuid
    AND email = 'miriamrstern@gmail.com';

  IF v_profile_count = 0 THEN
    RAISE EXCEPTION 'FAIL: user_profiles missing for parent user. Re-run seed.sql.';
  END IF;
  RAISE NOTICE 'PASS: user_profiles linked for parent user';

  SELECT COUNT(*) INTO v_family_links
  FROM family_members
  WHERE user_profile_id = '00000000-0000-0000-0000-000000000510'::uuid;

  IF v_family_links < 2 THEN
    RAISE WARNING 'WARN: expected 2 family_members links, found %', v_family_links;
  ELSE
    RAISE NOTICE 'PASS: parent linked to % families', v_family_links;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) INTO v_trigger_exists;

  IF NOT v_trigger_exists THEN
    RAISE EXCEPTION 'FAIL: on_auth_user_created trigger missing. Apply migration 016.';
  END IF;
  RAISE NOTICE 'PASS: handle_new_user trigger installed';
END $$;

-- Detail rows for manual inspection
SELECT id, email, email_confirmed_at, last_sign_in_at
FROM auth.users
WHERE email = :'parent_email';

SELECT id, email, role, tenant_id, person_id
FROM user_profiles
WHERE id = :'parent_user_id'::uuid;

SELECT fm.id, f.name AS family_name, fm.role
FROM family_members fm
JOIN families f ON f.id = fm.family_id
WHERE fm.user_profile_id = :'parent_user_id'::uuid;
