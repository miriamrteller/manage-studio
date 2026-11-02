#!/usr/bin/env bash
# Enquiry-form questions (20261102111617_lead_form_questions.sql): who can read
# and change tenants.lead_form, the public get_lead_form(), and lead answers
# staying inside their studio. Needs the local stack (see NEEDS_SUPABASE).
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/lead-form/run.sh
#
# Everything runs in one transaction that is rolled back.
set -euo pipefail
: "${DB_URL:?DB_URL required}"

psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB_URL" <<'SQL'
BEGIN;

CREATE TEMP TABLE ids ON COMMIT DROP AS SELECT
  gen_random_uuid() AS b, gen_random_uuid() AS c,
  gen_random_uuid() AS admin_b, gen_random_uuid() AS admin_c,
  gen_random_uuid() AS lead_b;

INSERT INTO tenants (id, name, subdomain, contact_email, lead_form)
SELECT x.id, x.n, 'lf-' || x.n || '-' || substr(md5(random()::text), 1, 8), 'lf@example.test', x.f
FROM ids, LATERAL (VALUES
  (ids.b, 'b', '{"presets":{"child_name":{"enabled":true,"required":true}},"custom":[]}'::jsonb),
  (ids.c, 'c', '{"presets":{},"custom":[{"id":"q1","type":"short_text","label":{"en":"C only","he":"C only"},"required":false}]}'::jsonb)
) AS x(id, n, f);

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT u.id, u.email, jsonb_build_object('subdomain', t.subdomain)
FROM ids, LATERAL (VALUES (ids.admin_b, 'lf-admin-b@example.test', ids.b),
                          (ids.admin_c, 'lf-admin-c@example.test', ids.c)) AS u(id, email, tenant)
JOIN tenants t ON t.id = u.tenant;

INSERT INTO user_profiles (id, tenant_id, role, email)
SELECT u.id, u.tenant, ARRAY['tenant_admin'], u.email
FROM ids, LATERAL (VALUES (ids.admin_b, ids.b, 'lf-admin-b@example.test'),
                          (ids.admin_c, ids.c, 'lf-admin-c@example.test')) AS u(id, tenant, email)
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, email = EXCLUDED.email;

INSERT INTO leads (id, tenant_id, name, child_name, answers)
SELECT lead_b, b, 'Parent B', 'Noa',
  '{"experience":{"label":{"en":"Previous experience","he":"ניסיון קודם"},"value":"none"}}'::jsonb
FROM ids;

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SELECT set_config('request.jwt.claim.sub', p_user::text, true);
$$;
CREATE FUNCTION pg_temp.act_as_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
  SELECT set_config('request.jwt.claim.sub', '', true);
$$;
GRANT SELECT ON ids TO authenticated, anon;

-- ── 1. A studio admin saves its own questions, not another studio's ─────────
SELECT pg_temp.act_as(admin_b) FROM ids;
SET LOCAL ROLE authenticated;
UPDATE tenants SET lead_form = '{"presets":{},"custom":[]}'::jsonb WHERE id = (SELECT b FROM ids);
UPDATE tenants SET lead_form = '{"hacked":true}'::jsonb WHERE id = (SELECT c FROM ids);
DO $$
BEGIN
  IF (SELECT count(*) FROM tenants WHERE id = (SELECT b FROM pg_temp.ids) AND lead_form IS NOT NULL) <> 1 THEN
    RAISE EXCEPTION 'FAIL admin cannot read its own lead_form (column grant missing?)';
  END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT lead_form FROM tenants WHERE id = (SELECT b FROM pg_temp.ids)) <> '{"presets":{},"custom":[]}'::jsonb THEN
    RAISE EXCEPTION 'FAIL admin could not save its own lead_form';
  END IF;
  IF (SELECT lead_form ? 'hacked' FROM tenants WHERE id = (SELECT c FROM pg_temp.ids)) THEN
    RAISE EXCEPTION 'FAIL admin of B changed studio C''s lead_form';
  END IF;
  RAISE NOTICE 'ok  admins read and save only their own studio''s questions';
END $$;

-- ── 2. The shape checks refuse non-objects ─────────────────────────────────
DO $$
BEGIN
  BEGIN
    UPDATE tenants SET lead_form = '[]'::jsonb WHERE id = (SELECT b FROM pg_temp.ids);
    RAISE EXCEPTION 'FAIL lead_form accepted a JSON array';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  lead_form must be a JSON object';
  END;
  BEGIN
    UPDATE leads SET answers = '"x"'::jsonb WHERE id = (SELECT lead_b FROM pg_temp.ids);
    RAISE EXCEPTION 'FAIL leads.answers accepted a JSON string';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  leads.answers must be a JSON object';
  END;
END $$;

-- ── 3. Visitors read a studio's questions only through get_lead_form ────────
SELECT pg_temp.act_as_anon();
SET LOCAL ROLE anon;
DO $$
DECLARE f jsonb;
BEGIN
  f := get_lead_form((SELECT c FROM pg_temp.ids));
  IF f -> 'custom' -> 0 ->> 'id' IS DISTINCT FROM 'q1' THEN
    RAISE EXCEPTION 'FAIL get_lead_form did not return studio C''s questions: %', f;
  END IF;
  IF get_lead_form(gen_random_uuid()) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL get_lead_form returned something for an unknown studio';
  END IF;
  BEGIN
    PERFORM lead_form FROM tenants LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'FAIL anon can read tenants.lead_form directly';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'ok  visitors get one studio''s questions via get_lead_form, not the table';
END $$;
RESET ROLE;

-- ── 4. Lead answers stay inside their studio ───────────────────────────────
SELECT pg_temp.act_as(admin_c) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM leads WHERE id = (SELECT lead_b FROM pg_temp.ids)) <> 0 THEN
    RAISE EXCEPTION 'FAIL admin of C can see studio B''s lead';
  END IF;
END $$;
UPDATE leads SET answers = '{}'::jsonb, child_name = 'Changed' WHERE id = (SELECT lead_b FROM ids);
RESET ROLE;
SELECT pg_temp.act_as(admin_b) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT child_name FROM leads WHERE id = (SELECT lead_b FROM pg_temp.ids)) IS DISTINCT FROM 'Noa'
     OR NOT coalesce((SELECT answers ? 'experience' FROM leads WHERE id = (SELECT lead_b FROM pg_temp.ids)), false) THEN
    RAISE EXCEPTION 'FAIL studio B''s lead answers were changed by C, or B cannot read them';
  END IF;
  RAISE NOTICE 'ok  lead answers are visible and changeable only in their own studio';
END $$;
RESET ROLE;

ROLLBACK;
SQL
echo "lead-form: all checks passed"
