#!/usr/bin/env bash
# Named enquiry forms (…_named_lead_forms.sql): slug rules and clashes, the
# public get_named_lead_form() (open / closed / unknown, no internal name),
# tenant isolation of lead_forms and leads.form_id. Needs the local stack.
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/named-lead-forms/run.sh
#
# Everything runs in one transaction that is rolled back.
set -euo pipefail
: "${DB_URL:?DB_URL required}"

psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB_URL" <<'SQL'
BEGIN;

CREATE TEMP TABLE ids ON COMMIT DROP AS SELECT
  gen_random_uuid() AS b, gen_random_uuid() AS c,
  gen_random_uuid() AS admin_b, gen_random_uuid() AS admin_c,
  gen_random_uuid() AS form_b, gen_random_uuid() AS form_c, gen_random_uuid() AS offering_c;

INSERT INTO tenants (id, name, subdomain, contact_email)
SELECT x.id, x.n, 'nf-' || x.n || '-' || substr(md5(random()::text), 1, 8), 'nf@example.test'
FROM ids, LATERAL (VALUES (ids.b, 'b'), (ids.c, 'c')) AS x(id, n);

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT u.id, u.email, jsonb_build_object('subdomain', t.subdomain)
FROM ids, LATERAL (VALUES (ids.admin_b, 'nf-admin-b@example.test', ids.b),
                          (ids.admin_c, 'nf-admin-c@example.test', ids.c)) AS u(id, email, tenant)
JOIN tenants t ON t.id = u.tenant;

INSERT INTO user_profiles (id, tenant_id, role, email)
SELECT u.id, u.tenant, ARRAY['tenant_admin'], u.email
FROM ids, LATERAL (VALUES (ids.admin_b, ids.b, 'nf-admin-b@example.test'),
                          (ids.admin_c, ids.c, 'nf-admin-c@example.test')) AS u(id, tenant, email)
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, email = EXCLUDED.email;

INSERT INTO offerings (id, tenant_id, name, offering_type, duration_mins) SELECT offering_c, c, 'C package', 'appointment', 60 FROM ids;

INSERT INTO lead_forms (id, tenant_id, slug, name, title_en)
SELECT form_b, b, 'grade2', 'Internal B name', 'Grade 2 trial' FROM ids;
INSERT INTO lead_forms (id, tenant_id, slug, name) SELECT form_c, c, 'grade2', 'Internal C name' FROM ids;

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SELECT set_config('request.jwt.claim.sub', p_user::text, true);
$$;
CREATE FUNCTION pg_temp.act_as_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
  SELECT set_config('request.jwt.claim.sub', '', true);
$$;
GRANT SELECT ON ids TO authenticated, anon;

-- ── 1. Slugs: unique per studio, format and reserved words checked ─────────
DO $$
BEGIN
  BEGIN
    INSERT INTO lead_forms (tenant_id, slug, name) SELECT b, 'grade2', 'Clash' FROM pg_temp.ids;
    RAISE EXCEPTION 'FAIL a second grade2 form in the same studio was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO lead_forms (tenant_id, slug, name) SELECT b, 'inquire', 'Reserved' FROM pg_temp.ids;
    RAISE EXCEPTION 'FAIL reserved slug accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO lead_forms (tenant_id, slug, name) SELECT b, 'Bad Slug', 'Format' FROM pg_temp.ids;
    RAISE EXCEPTION 'FAIL badly formed slug accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO lead_forms (tenant_id, slug, name, offering_id) SELECT b, 'other', 'Other', offering_c FROM pg_temp.ids;
    RAISE EXCEPTION 'FAIL a form used another studio''s class';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok  slugs: one per studio (same slug fine in another studio), format, reserved; own classes only';
END $$;

-- ── 2. Public read: open, closed (off / past last day), unknown; no internal name ──
SELECT pg_temp.act_as_anon();
SET LOCAL ROLE anon;
DO $$
DECLARE f jsonb;
BEGIN
  f := get_named_lead_form((SELECT b FROM pg_temp.ids), 'GRADE2 ');
  IF f ->> 'status' <> 'open' OR f ->> 'title_en' <> 'Grade 2 trial' OR f ->> 'id' IS NULL THEN
    RAISE EXCEPTION 'FAIL open form not returned: %', f;
  END IF;
  IF f::text LIKE '%Internal B name%' THEN
    RAISE EXCEPTION 'FAIL the internal name reached a visitor';
  END IF;
  IF get_named_lead_form((SELECT b FROM pg_temp.ids), 'nope') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL unknown slug returned something';
  END IF;
  BEGIN
    PERFORM 1 FROM lead_forms LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'FAIL anon can read lead_forms directly'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok  visitors get an open form via get_named_lead_form only, without its internal name';
END $$;
RESET ROLE;

UPDATE lead_forms SET ends_on = ((now() AT TIME ZONE 'Asia/Jerusalem')::date - 1) WHERE id = (SELECT form_b FROM ids);
UPDATE lead_forms SET active = false WHERE id = (SELECT form_c FROM ids);
SET LOCAL ROLE anon;
DO $$
DECLARE f jsonb;
BEGIN
  f := get_named_lead_form((SELECT b FROM pg_temp.ids), 'grade2');
  IF f <> '{"status":"closed"}'::jsonb THEN RAISE EXCEPTION 'FAIL past its last day should be closed: %', f; END IF;
  f := get_named_lead_form((SELECT c FROM pg_temp.ids), 'grade2');
  IF f <> '{"status":"closed"}'::jsonb THEN RAISE EXCEPTION 'FAIL switched off should be closed: %', f; END IF;
  RAISE NOTICE 'ok  off or past its last day → closed, with no details';
END $$;
RESET ROLE;
UPDATE lead_forms SET ends_on = (now() AT TIME ZONE 'Asia/Jerusalem')::date WHERE id = (SELECT form_b FROM ids);
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF get_named_lead_form((SELECT b FROM pg_temp.ids), 'grade2') ->> 'status' <> 'open' THEN
    RAISE EXCEPTION 'FAIL the last day itself should still be open';
  END IF;
  RAISE NOTICE 'ok  the last day is still open';
END $$;
RESET ROLE;

-- ── 3. Tenant isolation ─────────────────────────────────────────────────────
SELECT pg_temp.act_as(admin_c) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM lead_forms WHERE id = (SELECT form_b FROM pg_temp.ids)) <> 0 THEN
    RAISE EXCEPTION 'FAIL admin of C sees studio B''s form';
  END IF;
  IF (SELECT count(*) FROM lead_forms WHERE id = (SELECT form_c FROM pg_temp.ids)) <> 1 THEN
    RAISE EXCEPTION 'FAIL admin of C cannot see its own form';
  END IF;
  BEGIN
    INSERT INTO lead_forms (tenant_id, slug, name) SELECT b, 'sneaky', 'Sneaky' FROM pg_temp.ids;
    RAISE EXCEPTION 'FAIL admin of C created a form in studio B';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
UPDATE lead_forms SET name = 'Hacked' WHERE id = (SELECT form_b FROM ids);
RESET ROLE;
DO $$
BEGIN
  IF (SELECT name FROM lead_forms WHERE id = (SELECT form_b FROM pg_temp.ids)) <> 'Internal B name' THEN
    RAISE EXCEPTION 'FAIL admin of C renamed studio B''s form';
  END IF;
  BEGIN
    INSERT INTO leads (tenant_id, name, form_id) SELECT b, 'Wrong form', form_c FROM pg_temp.ids;
    RAISE EXCEPTION 'FAIL a lead in B was linked to C''s form';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO leads (tenant_id, name, form_id) SELECT b, 'Right form', form_b FROM pg_temp.ids;
  DELETE FROM lead_forms WHERE id = (SELECT form_b FROM pg_temp.ids);
  IF (SELECT form_id FROM leads WHERE name = 'Right form' AND tenant_id = (SELECT b FROM pg_temp.ids)) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL deleting a form should keep its leads (form_id → NULL)';
  END IF;
  RAISE NOTICE 'ok  forms and lead links stay inside their studio; deleting a form keeps its leads';
END $$;

ROLLBACK;
SQL
echo "named-lead-forms: all checks passed"
