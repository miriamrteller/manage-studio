#!/usr/bin/env bash
# Platform access log (20261101140810_platform_access_log.sql). Needs Supabase's
# roles, auth schema and every migration applied — the local stack (CI
# local-stack job) — so sql-tests skips it (see NEEDS_SUPABASE).
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/platform-access-log/run.sh
#
# Everything runs in one transaction that is rolled back.
set -euo pipefail
: "${DB_URL:?DB_URL required}"

psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB_URL" <<'SQL'
BEGIN;

-- ── fixtures (as postgres) ───────────────────────────────────────────────────
-- Studios: HOME (the platform owner's own profile tenant), B and C.
CREATE TEMP TABLE ids ON COMMIT DROP AS SELECT
  gen_random_uuid() AS home, gen_random_uuid() AS b, gen_random_uuid() AS c,
  gen_random_uuid() AS admin_b, gen_random_uuid() AS admin_c,
  gen_random_uuid() AS person_b, gen_random_uuid() AS person_home,
  NULL::uuid AS sa;

INSERT INTO tenants (id, name, subdomain, contact_email)
SELECT x.id, x.n, 'pal-' || x.n || '-' || substr(md5(random()::text), 1, 8), 'pal@example.test'
FROM ids, LATERAL (VALUES (ids.home, 'home'), (ids.b, 'b'), (ids.c, 'c')) AS x(id, n);

-- The super_admin is reserved for one email (20260827000100); reuse the
-- seeded account when present.
UPDATE ids SET sa = coalesce(
  (SELECT id FROM auth.users WHERE lower(email) = 'miriamrteller@gmail.com' LIMIT 1), gen_random_uuid());

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT u.id, u.email, jsonb_build_object('subdomain', t.subdomain)
FROM ids, LATERAL (VALUES (ids.sa, 'miriamrteller@gmail.com', ids.home),
                          (ids.admin_b, 'pal-admin-b@example.test', ids.b),
                          (ids.admin_c, 'pal-admin-c@example.test', ids.c)) AS u(id, email, tenant)
JOIN tenants t ON t.id = u.tenant
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_profiles (id, tenant_id, role, email)
SELECT u.id, u.tenant, u.role, u.email
FROM ids, LATERAL (VALUES (ids.sa, ids.home, ARRAY['super_admin', 'tenant_admin'], 'miriamrteller@gmail.com'),
                          (ids.admin_b, ids.b, ARRAY['tenant_admin'], 'pal-admin-b@example.test'),
                          (ids.admin_c, ids.c, ARRAY['tenant_admin'], 'pal-admin-c@example.test')) AS u(id, tenant, role, email)
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, email = EXCLUDED.email;

INSERT INTO people (id, tenant_id, name)
SELECT person_b, b, 'Dancer B' FROM ids UNION ALL SELECT person_home, home, 'Dancer Home' FROM ids;

-- Session helpers: act as a signed-in user, or as the service role.
CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SELECT set_config('request.jwt.claim.sub', p_user::text, true);
$$;
CREATE FUNCTION pg_temp.act_as_service() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT set_config('request.jwt.claim.sub', '', true);
$$;
GRANT SELECT ON ids TO authenticated, service_role;
CREATE FUNCTION pg_temp.n_log() RETURNS bigint LANGUAGE sql AS $$ SELECT count(*) FROM platform_access_log $$;
CREATE TEMP TABLE mark ON COMMIT DROP AS SELECT pg_temp.n_log() AS n;

-- ── 1. super_admin changes another studio's row → one 'change' row ──────────
SELECT pg_temp.act_as(sa) FROM ids;
SET LOCAL ROLE authenticated;
UPDATE people SET name = 'Renamed B' WHERE id = (SELECT person_b FROM ids);
RESET ROLE;
DO $$
DECLARE r platform_access_log;
BEGIN
  SELECT * INTO STRICT r FROM platform_access_log l, ids
  WHERE l.tenant_id = ids.b AND l.kind = 'change';
  IF r.area <> 'people' OR r.record_id <> (SELECT person_b FROM ids) OR r.actor_id <> (SELECT sa FROM ids) THEN
    RAISE EXCEPTION 'FAIL change row has wrong area/record/actor: %', row_to_json(r);
  END IF;
  IF r.detail <> 'update: name' OR r.detail LIKE '%Renamed%' THEN
    RAISE EXCEPTION 'FAIL change detail must list column names only, got %', r.detail;
  END IF;
  RAISE NOTICE 'ok  super_admin change in another studio is logged (columns only, no values)';
END $$;

-- ── 2. super_admin in their own studio, tenant_admin, service role → no row ─
UPDATE mark SET n = pg_temp.n_log();
SELECT pg_temp.act_as(sa) FROM ids;
SET LOCAL ROLE authenticated;
UPDATE people SET name = 'Renamed Home' WHERE id = (SELECT person_home FROM ids);
RESET ROLE;
SELECT pg_temp.act_as(admin_b) FROM ids;
SET LOCAL ROLE authenticated;
UPDATE people SET name = 'Renamed by admin' WHERE id = (SELECT person_b FROM ids);
RESET ROLE;
SELECT pg_temp.act_as_service();
SET LOCAL ROLE service_role;
UPDATE people SET name = 'Renamed by service' WHERE id = (SELECT person_b FROM ids);
INSERT INTO people (tenant_id, name) SELECT b, 'Service insert' FROM ids;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM people p, ids WHERE p.id = ids.person_b AND p.name = 'Renamed by service') <> 1 THEN
    RAISE EXCEPTION 'FAIL fixture: the tenant_admin/service updates did not apply';
  END IF;
  IF pg_temp.n_log() <> (SELECT n FROM mark) THEN
    RAISE EXCEPTION 'FAIL own-studio / tenant_admin / service-role writes were logged';
  END IF;
  RAISE NOTICE 'ok  own-studio, tenant_admin and service-role writes are not logged';
END $$;

-- ── 3. views: logged once per 10 minutes, no-op for anyone else ─────────────
SELECT pg_temp.act_as(sa) FROM ids;
SET LOCAL ROLE authenticated;
SELECT log_platform_view(b, 'students') FROM ids;
SELECT log_platform_view(b, 'students') FROM ids;
SELECT log_platform_view(c, 'payments') FROM ids;
SELECT log_platform_view(home, 'students') FROM ids;
RESET ROLE;
SELECT pg_temp.act_as(admin_b) FROM ids;
SET LOCAL ROLE authenticated;
SELECT log_platform_view(b, 'settings') FROM ids;
RESET ROLE;
DO $$
DECLARE v_b int; v_c int; v_home int; v_admin int;
BEGIN
  SELECT count(*) FILTER (WHERE tenant_id = ids.b AND area = 'students'),
         count(*) FILTER (WHERE tenant_id = ids.c),
         count(*) FILTER (WHERE tenant_id = ids.home),
         count(*) FILTER (WHERE tenant_id = ids.b AND area = 'settings')
    INTO v_b, v_c, v_home, v_admin
  FROM platform_access_log, ids WHERE kind = 'view' GROUP BY ids.b, ids.c, ids.home;
  IF (v_b, v_c, v_home, v_admin) IS DISTINCT FROM (1, 1, 0, 0) THEN
    RAISE EXCEPTION 'FAIL views: b=% c=% home=% admin=% (want 1 1 0 0)', v_b, v_c, v_home, v_admin;
  END IF;
  RAISE NOTICE 'ok  views logged once per 10 minutes; own studio and tenant_admin not logged';
END $$;

-- ── 4. append-only, for every role ───────────────────────────────────────────
DO $$
DECLARE who text;
BEGIN
  FOREACH who IN ARRAY ARRAY['postgres', 'service_role', 'super_admin'] LOOP
    IF who = 'super_admin' THEN
      PERFORM pg_temp.act_as(sa) FROM ids;
      SET LOCAL ROLE authenticated;
    ELSIF who = 'service_role' THEN
      PERFORM pg_temp.act_as_service();
      SET LOCAL ROLE service_role;
    END IF;
    BEGIN
      UPDATE platform_access_log SET detail = 'tampered';
      IF FOUND THEN RAISE EXCEPTION 'FAIL % could UPDATE platform_access_log', who; END IF;
      IF who <> 'super_admin' THEN RAISE EXCEPTION 'FAIL % UPDATE was not refused', who; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      DELETE FROM platform_access_log;
      IF FOUND THEN RAISE EXCEPTION 'FAIL % could DELETE from platform_access_log', who; END IF;
      IF who <> 'super_admin' THEN RAISE EXCEPTION 'FAIL % DELETE was not refused', who; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      TRUNCATE platform_access_log;
      RAISE EXCEPTION 'FAIL % could TRUNCATE platform_access_log', who;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM platform_access_log WHERE detail = 'update: name') THEN
    RAISE EXCEPTION 'FAIL log rows changed or vanished';
  END IF;
  RAISE NOTICE 'ok  UPDATE / DELETE / TRUNCATE refused for postgres, service_role and super_admin';
END $$;

-- ── 5. reads: tenant_admin sees only their own studio; super_admin sees all ──
DO $$
DECLARE v_mine int; v_other int; v_all int;
BEGIN
  PERFORM pg_temp.act_as(admin_b) FROM ids;
  SET LOCAL ROLE authenticated;
  SELECT count(*) FILTER (WHERE tenant_id = (SELECT b FROM pg_temp.ids)),
         count(*) FILTER (WHERE tenant_id <> (SELECT b FROM pg_temp.ids))
    INTO v_mine, v_other FROM platform_access_log;
  RESET ROLE;
  IF v_mine < 2 OR v_other <> 0 THEN
    RAISE EXCEPTION 'FAIL tenant_admin B sees % own and % other rows (want >=2 and 0)', v_mine, v_other;
  END IF;

  PERFORM pg_temp.act_as(admin_c) FROM ids;
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_other FROM platform_access_log WHERE tenant_id <> (SELECT c FROM pg_temp.ids);
  RESET ROLE;
  IF v_other <> 0 THEN RAISE EXCEPTION 'FAIL tenant_admin C sees other studios'' rows'; END IF;

  PERFORM pg_temp.act_as(sa) FROM ids;
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_all FROM platform_access_log
    WHERE tenant_id IN ((SELECT b FROM pg_temp.ids), (SELECT c FROM pg_temp.ids));
  RESET ROLE;
  IF v_all < 3 THEN RAISE EXCEPTION 'FAIL super_admin sees only % rows', v_all; END IF;

  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM platform_access_log;
    RAISE EXCEPTION 'FAIL anon can read platform_access_log';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'ok  tenant_admins read only their own studio; super_admin reads all; anon none';
END $$;

ROLLBACK;
SQL
echo "platform-access-log: all checks passed"
