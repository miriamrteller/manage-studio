#!/usr/bin/env bash
# Platform owner without a studio (20261102084332_platform_owner_without_studio.sql).
# Needs Supabase's auth schema and every migration applied (the local stack), so
# sql-tests skips it (see NEEDS_SUPABASE).
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/platform-owner/run.sh
#
# Everything runs in one transaction that is rolled back.
set -euo pipefail
: "${DB_URL:?DB_URL required}"

psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB_URL" <<'SQL'
BEGIN;

-- The local seed already has the owner (on a studio). Move that account aside so
-- this transaction can sign the owner up from scratch, as on an empty production.
UPDATE auth.users SET email = 'owner-moved-aside@example.test'
WHERE lower(email) = 'miriamrteller@gmail.com';

CREATE TEMP TABLE ids ON COMMIT DROP AS SELECT
  gen_random_uuid() AS owner, gen_random_uuid() AS stranger,
  gen_random_uuid() AS member, gen_random_uuid() AS studio;

INSERT INTO tenants (id, name, subdomain, contact_email)
SELECT studio, 'Owner test studio', 'pown-' || substr(md5(random()::text), 1, 8), 'pown@example.test' FROM ids;

DO $$
DECLARE
  v_owner    UUID := (SELECT owner FROM pg_temp.ids);
  v_stranger UUID := (SELECT stranger FROM pg_temp.ids);
  v_member   UUID := (SELECT member FROM pg_temp.ids);
  v_studio   UUID := (SELECT studio FROM pg_temp.ids);
  v_sub      TEXT := (SELECT subdomain FROM tenants WHERE id = (SELECT studio FROM pg_temp.ids));
  v_profile  user_profiles%ROWTYPE;
BEGIN
  -- 1. The owner signs up on the platform host: no studio in the metadata.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_owner, 'MiriamRTeller@gmail.com', '{"language":"he"}'::jsonb);
  SELECT * INTO v_profile FROM user_profiles WHERE id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL owner got no profile'; END IF;
  IF v_profile.tenant_id IS NOT NULL THEN RAISE EXCEPTION 'FAIL owner profile has a studio'; END IF;
  IF v_profile.role <> ARRAY['super_admin'] THEN RAISE EXCEPTION 'FAIL owner role is %', v_profile.role; END IF;
  RAISE NOTICE 'ok  the platform owner gets a super_admin profile with no studio';

  -- 2. Anyone else without a studio is refused.
  BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (v_stranger, 'someone@example.test', '{}'::jsonb);
    RAISE EXCEPTION 'FAIL a non-owner account was created without a studio';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM user_profiles WHERE id = v_stranger) THEN
    RAISE EXCEPTION 'FAIL stranger has a profile';
  END IF;
  RAISE NOTICE 'ok  another email without a studio is refused';

  -- 3. Studio sign-ups are unchanged.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_member, 'member@example.test', jsonb_build_object('subdomain', v_sub));
  SELECT * INTO v_profile FROM user_profiles WHERE id = v_member;
  IF v_profile.tenant_id IS DISTINCT FROM v_studio THEN RAISE EXCEPTION 'FAIL member not in the studio'; END IF;
  IF 'super_admin' = ANY (v_profile.role) THEN RAISE EXCEPTION 'FAIL member got super_admin'; END IF;
  RAISE NOTICE 'ok  a studio sign-up lands in that studio, as before';

  -- 4. Only a super_admin profile may have no studio.
  BEGIN
    UPDATE user_profiles SET tenant_id = NULL WHERE id = v_member;
    RAISE EXCEPTION 'FAIL a non-owner profile lost its studio';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok  no other profile can be studio-less';

  -- 5. super_admin stays reserved for the owner's email.
  BEGIN
    UPDATE user_profiles SET role = ARRAY['super_admin'] WHERE id = v_member;
    RAISE EXCEPTION 'FAIL super_admin granted to another email';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  super_admin is still reserved';
END $$;

ROLLBACK;
SQL
echo "platform-owner: all checks passed"
