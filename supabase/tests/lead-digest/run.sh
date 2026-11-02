#!/usr/bin/env bash
# Daily lead follow-up digest (…_lead_followup_digest.sql): at most one digest
# per studio, recipient and day; opt-outs are per admin and stay in their
# studio; the cron job is scheduled. Needs the local stack (see NEEDS_SUPABASE).
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/lead-digest/run.sh
#
# Everything runs in one transaction that is rolled back.
set -euo pipefail
: "${DB_URL:?DB_URL required}"

psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB_URL" <<'SQL'
BEGIN;

CREATE TEMP TABLE ids ON COMMIT DROP AS SELECT
  gen_random_uuid() AS b, gen_random_uuid() AS c,
  gen_random_uuid() AS admin_b, gen_random_uuid() AS admin_b2, gen_random_uuid() AS admin_c;

INSERT INTO tenants (id, name, subdomain, contact_email)
SELECT x.id, x.n, 'ld-' || x.n || '-' || substr(md5(random()::text), 1, 8), 'ld@example.test'
FROM ids, LATERAL (VALUES (ids.b, 'b'), (ids.c, 'c')) AS x(id, n);

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT u.id, u.email, jsonb_build_object('subdomain', t.subdomain)
FROM ids, LATERAL (VALUES (ids.admin_b, 'ld-b@example.test', ids.b),
                          (ids.admin_b2, 'ld-b2@example.test', ids.b),
                          (ids.admin_c, 'ld-c@example.test', ids.c)) AS u(id, email, tenant)
JOIN tenants t ON t.id = u.tenant;

INSERT INTO user_profiles (id, tenant_id, role, email)
SELECT u.id, u.tenant, ARRAY['tenant_admin'], u.email
FROM ids, LATERAL (VALUES (ids.admin_b, ids.b, 'ld-b@example.test'),
                          (ids.admin_b2, ids.b, 'ld-b2@example.test'),
                          (ids.admin_c, ids.c, 'ld-c@example.test')) AS u(id, tenant, email)
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, email = EXCLUDED.email;

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SELECT set_config('request.jwt.claim.sub', p_user::text, true);
$$;
GRANT SELECT ON ids TO authenticated;

-- ── 1. One digest per studio, recipient and day ─────────────────────────────
DO $$
DECLARE v_b uuid := (SELECT b FROM pg_temp.ids);
BEGIN
  INSERT INTO notification_log (tenant_id, recipient_email, channel, template_name, status, variables)
  VALUES (v_b, 'ld-b@example.test', 'email', 'lead_followup_digest', 'pending', '{"digest_date":"2026-11-02"}');
  BEGIN
    INSERT INTO notification_log (tenant_id, recipient_email, channel, template_name, status, variables)
    VALUES (v_b, 'ld-b@example.test', 'email', 'lead_followup_digest', 'pending', '{"digest_date":"2026-11-02"}');
    RAISE EXCEPTION 'FAIL a second digest for the same day was claimed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- Next day, another admin, and other templates are unaffected.
  INSERT INTO notification_log (tenant_id, recipient_email, channel, template_name, status, variables)
  VALUES (v_b, 'ld-b@example.test', 'email', 'lead_followup_digest', 'pending', '{"digest_date":"2026-11-03"}'),
         (v_b, 'ld-b2@example.test', 'email', 'lead_followup_digest', 'pending', '{"digest_date":"2026-11-02"}'),
         (v_b, 'ld-b@example.test', 'email', 'crm_new_lead', 'sent', '{"digest_date":"2026-11-02"}'),
         (v_b, 'ld-b@example.test', 'email', 'crm_new_lead', 'sent', '{"digest_date":"2026-11-02"}');
  RAISE NOTICE 'ok  one digest per studio, recipient and day; other days, admins and emails unaffected';
END $$;

-- ── 2. Opt-outs: each admin only their own row, in their own studio ────────
SELECT pg_temp.act_as(admin_b) FROM ids;
SET LOCAL ROLE authenticated;
INSERT INTO lead_digest_optouts (user_id, tenant_id) SELECT admin_b, b FROM ids;
DO $$
BEGIN
  BEGIN
    INSERT INTO lead_digest_optouts (user_id, tenant_id) SELECT admin_b2, b FROM pg_temp.ids;
    RAISE EXCEPTION 'FAIL an admin switched the digest off for another admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO lead_digest_optouts (user_id, tenant_id) SELECT admin_b, c FROM pg_temp.ids;
    RAISE EXCEPTION 'FAIL an opt-out was filed under another studio';
  EXCEPTION WHEN insufficient_privilege OR unique_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM lead_digest_optouts) <> 1 THEN
    RAISE EXCEPTION 'FAIL an admin should see only their own opt-out';
  END IF;
END $$;
RESET ROLE;
SELECT pg_temp.act_as(admin_c) FROM ids;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM lead_digest_optouts) <> 0 THEN
    RAISE EXCEPTION 'FAIL another studio''s admin sees opt-outs';
  END IF;
  DELETE FROM lead_digest_optouts WHERE user_id = (SELECT admin_b FROM pg_temp.ids);
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM lead_digest_optouts WHERE user_id = (SELECT admin_b FROM pg_temp.ids)) <> 1 THEN
    RAISE EXCEPTION 'FAIL another studio''s admin removed an opt-out';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE command ILIKE '%/functions/v1/run-lead-followup-digest%') THEN
    RAISE EXCEPTION 'FAIL the daily digest is not scheduled';
  END IF;
  RAISE NOTICE 'ok  opt-outs are per admin and per studio; digest scheduled';
END $$;

ROLLBACK;
SQL
echo "lead-digest: all checks passed"
