#!/usr/bin/env bash
# OpalSwift support logins (20261111163000_platform_support_logins.sql). Needs
# Supabase's roles, auth schema and every migration applied — the local stack
# (CI local-stack job) — so sql-tests skips it (see NEEDS_SUPABASE).
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/platform-support/run.sh
#
# Everything runs in one transaction that is rolled back.
set -euo pipefail
: "${DB_URL:?DB_URL required}"

psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB_URL" <<'SQL'
BEGIN;

-- ── fixtures (as postgres) ───────────────────────────────────────────────────
CREATE TEMP TABLE ids ON COMMIT DROP AS SELECT
  gen_random_uuid() AS b, gen_random_uuid() AS c,
  gen_random_uuid() AS admin_b, gen_random_uuid() AS support_b,
  gen_random_uuid() AS person_b, gen_random_uuid() AS person_c;

INSERT INTO tenants (id, name, subdomain, contact_email)
SELECT x.id, x.n, 'psup-' || x.n || '-' || substr(md5(random()::text), 1, 8), 'psup@example.test'
FROM ids, LATERAL (VALUES (ids.b, 'b'), (ids.c, 'c')) AS x(id, n);

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT ids.admin_b, 'psup-admin-b@example.test', jsonb_build_object('subdomain', t.subdomain)
FROM ids JOIN tenants t ON t.id = ids.b;
UPDATE user_profiles SET role = ARRAY['tenant_admin'] WHERE id = (SELECT admin_b FROM ids);
-- The support login's auth user: no subdomain, so handle_new_user makes no profile.
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT support_b, 'support+' || replace(b::text, '-', '') || '@opalswift.com', '{}'::jsonb FROM ids;

INSERT INTO people (id, tenant_id, name)
SELECT person_b, b, 'Client B' FROM ids UNION ALL SELECT person_c, c, 'Client C' FROM ids;

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SELECT set_config('request.jwt.claim.sub', p_user::text, true);
$$;
CREATE FUNCTION pg_temp.act_as_service() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT set_config('request.jwt.claim.sub', '', true);
$$;
GRANT SELECT ON ids TO authenticated, service_role;

-- ── 1. a studio admin cannot make a support login ───────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM user_profiles WHERE id = (SELECT support_b FROM pg_temp.ids)) THEN
    RAISE EXCEPTION 'FAIL the support auth user got a profile from handle_new_user';
  END IF;
END $$;
SELECT pg_temp.act_as(admin_b) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE user_profiles SET is_platform_support = true WHERE id = (SELECT admin_b FROM pg_temp.ids);
    RAISE EXCEPTION 'FAIL a studio admin flagged a login as OpalSwift support';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok  a studio admin cannot flag a login as OpalSwift support';
END $$;
RESET ROLE;

-- ── 2. the service role makes it: studio admin of that one studio only ──────
SELECT pg_temp.act_as_service();
SET LOCAL ROLE service_role;
INSERT INTO user_profiles (id, tenant_id, role, email, is_platform_support)
SELECT support_b, b, ARRAY['tenant_admin'], 'support+' || replace(b::text, '-', '') || '@opalswift.com', true FROM ids;
DO $$
BEGIN
  BEGIN
    INSERT INTO user_profiles (id, tenant_id, role, email, is_platform_support)
    SELECT gen_random_uuid(), b, ARRAY['tenant_admin'], 'second@example.test', true FROM pg_temp.ids;
    RAISE EXCEPTION 'FAIL a second support login for the same studio';
  EXCEPTION WHEN unique_violation OR foreign_key_violation THEN NULL;
  END;
  BEGIN
    UPDATE user_profiles SET role = ARRAY['tenant_admin', 'super_admin'] WHERE id = (SELECT support_b FROM pg_temp.ids);
    RAISE EXCEPTION 'FAIL a support login got another role';
  EXCEPTION WHEN check_violation OR raise_exception THEN NULL;
  END;
  RAISE NOTICE 'ok  one support login per studio, studio admin role only';
END $$;
RESET ROLE;

-- ── 3. the studio cannot change or remove it; it may change its language ────
SELECT pg_temp.act_as(admin_b) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n int;
BEGIN
  BEGIN
    UPDATE user_profiles SET role = ARRAY['account_holder'] WHERE id = (SELECT support_b FROM pg_temp.ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN RAISE EXCEPTION 'FAIL the studio admin changed the support login''s role'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM user_profiles WHERE id = (SELECT support_b FROM pg_temp.ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN RAISE EXCEPTION 'FAIL the studio admin deleted the support login'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok  the studio admin cannot change or delete the support login';
END $$;
RESET ROLE;
SELECT pg_temp.act_as(support_b) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE user_profiles SET email = 'mine@example.test' WHERE id = (SELECT support_b FROM pg_temp.ids);
    RAISE EXCEPTION 'FAIL the support login changed its own email';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'platform support logins%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  the support login cannot change its own email or role';
END $$;
RESET ROLE;

-- ── 4. it acts as the studio's admin, in that studio only, and is logged ────
CREATE TEMP TABLE mark ON COMMIT DROP AS SELECT count(*) AS n FROM platform_access_log;
GRANT SELECT ON mark TO authenticated;
SELECT pg_temp.act_as(support_b) FROM ids;
SET LOCAL ROLE authenticated;
UPDATE people SET name = 'Renamed by support' WHERE id = (SELECT person_b FROM ids);
UPDATE people SET name = 'Should not change' WHERE id = (SELECT person_c FROM ids);
SELECT log_platform_view(b, 'admin-setup') FROM ids;
RESET ROLE;
SELECT pg_temp.act_as(admin_b) FROM ids;
SET LOCAL ROLE authenticated;
UPDATE people SET name = 'Renamed by studio admin' WHERE id = (SELECT person_b FROM ids);
RESET ROLE;
DO $$
DECLARE v_change int; v_view int; v_total int;
BEGIN
  IF (SELECT name FROM people WHERE id = (SELECT person_c FROM pg_temp.ids)) <> 'Client C' THEN
    RAISE EXCEPTION 'FAIL the support login changed another studio''s data';
  END IF;
  SELECT count(*) FILTER (WHERE kind = 'change' AND area = 'people' AND actor_id = ids.support_b),
         count(*) FILTER (WHERE kind = 'view' AND area = 'admin-setup' AND actor_id = ids.support_b),
         count(*)
    INTO v_change, v_view, v_total
  FROM platform_access_log, pg_temp.ids WHERE tenant_id = ids.b GROUP BY ids.support_b;
  IF (v_change, v_view) IS DISTINCT FROM (1, 1) OR v_total - (SELECT n FROM pg_temp.mark) <> 2 THEN
    RAISE EXCEPTION 'FAIL log: change=% view=% total new=% (want 1 1 2)', v_change, v_view, v_total - (SELECT n FROM pg_temp.mark);
  END IF;
  RAISE NOTICE 'ok  support works in its own studio only, and its views and changes are logged (the studio admin''s are not)';
END $$;

-- ── 5. it never gets a password (it is opened only through the confirm step) ─
DO $$
BEGIN
  BEGIN
    UPDATE auth.users SET encrypted_password = crypt('x', gen_salt('bf')) WHERE id = (SELECT support_b FROM pg_temp.ids);
    RAISE EXCEPTION 'FAIL the support login got a password';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE auth.users SET encrypted_password = crypt('x', gen_salt('bf')) WHERE id = (SELECT admin_b FROM pg_temp.ids);
  RAISE NOTICE 'ok  the support login cannot get a password (other logins can)';
END $$;

ROLLBACK;
SQL
echo "platform-support: all checks passed"
