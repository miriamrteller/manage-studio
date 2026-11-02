#!/usr/bin/env bash
# Class pipeline (…_lead_class_pipeline.sql): auto-link a lead when the same
# family enrols in a class (email or phone), suggestions when several leads
# match, photographer appointments untouched, tenant isolation, and the new
# stages. Needs the local stack (see NEEDS_SUPABASE).
#
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/lead-pipeline/run.sh
#
# Everything runs in one transaction that is rolled back.
set -euo pipefail
: "${DB_URL:?DB_URL required}"

psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB_URL" <<'SQL'
BEGIN;

CREATE TEMP TABLE ids ON COMMIT DROP AS SELECT
  gen_random_uuid() AS b, gen_random_uuid() AS c,
  gen_random_uuid() AS cls, gen_random_uuid() AS appt, gen_random_uuid() AS cls_c;

INSERT INTO tenants (id, name, subdomain, contact_email)
SELECT x.id, x.n, 'lp-' || x.n || '-' || substr(md5(random()::text), 1, 8), 'lp@example.test'
FROM ids, LATERAL (VALUES (ids.b, 'b'), (ids.c, 'c')) AS x(id, n);

INSERT INTO offerings (id, tenant_id, name, offering_type, start_time, end_time)
SELECT cls, b, 'Ballet 1', 'class', '16:00'::time, '17:00'::time FROM ids
UNION ALL SELECT cls_c, c, 'C ballet', 'class', '16:00'::time, '17:00'::time FROM ids;
INSERT INTO offerings (id, tenant_id, name, offering_type, duration_mins)
SELECT appt, b, 'Family shoot', 'appointment', 60 FROM ids;

-- A family: parent (main contact, with email or phone) and a child; returns the child.
CREATE FUNCTION pg_temp.family(p_tenant uuid, p_tag text, p_email text, p_phone text) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_parent uuid := gen_random_uuid(); v_child uuid := gen_random_uuid(); v_account uuid := gen_random_uuid();
BEGIN
  INSERT INTO people (id, tenant_id, name, email) VALUES (v_parent, p_tenant, 'Parent ' || p_tag, p_email);
  INSERT INTO accounts (id, tenant_id, name, person_id) VALUES (v_account, p_tenant, 'Family ' || p_tag, v_parent);
  UPDATE people SET account_id = v_account WHERE id = v_parent;
  INSERT INTO people (id, tenant_id, name, account_id) VALUES (v_child, p_tenant, 'Child ' || p_tag, v_account);
  IF p_phone IS NOT NULL THEN
    INSERT INTO contact_preferences (tenant_id, person_id, whatsapp_number) VALUES (p_tenant, v_parent, p_phone);
  END IF;
  RETURN v_child;
END $$;

CREATE FUNCTION pg_temp.enrol(p_tenant uuid, p_child uuid, p_offering uuid) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO engagements (tenant_id, person_id, offering_id) VALUES (p_tenant, p_child, p_offering) RETURNING id;
$$;

CREATE FUNCTION pg_temp.lead(p_tenant uuid, p_name text, p_email text, p_phone text, p_stage text DEFAULT 'new') RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO leads (tenant_id, name, email, phone, stage) VALUES (p_tenant, p_name, p_email, p_phone, p_stage) RETURNING id;
$$;

-- ── 1. One matching lead (email, any case) → won and linked ─────────────────
DO $$
DECLARE v_b uuid := (SELECT b FROM pg_temp.ids); v_c uuid := (SELECT c FROM pg_temp.ids);
        v_lead uuid; v_other_studio uuid; v_lost uuid; v_child uuid; v_eng uuid; r leads%ROWTYPE;
BEGIN
  v_lead := pg_temp.lead(v_b, 'Dana', 'Dana@Example.test', NULL, 'trial_done');
  v_lost := pg_temp.lead(v_b, 'Dana old', 'dana@example.test', NULL, 'lost');
  v_other_studio := pg_temp.lead(v_c, 'Dana at C', 'dana@example.test', NULL);
  v_child := pg_temp.family(v_b, '1', 'dana@example.test', NULL);
  v_eng := pg_temp.enrol(v_b, v_child, (SELECT cls FROM pg_temp.ids));
  SELECT * INTO r FROM leads WHERE id = v_lead;
  IF r.stage <> 'won' OR r.converted_engagement_id <> v_eng OR r.converted_account_id IS NULL OR r.converted_at IS NULL THEN
    RAISE EXCEPTION 'FAIL email match not linked: %', row_to_json(r);
  END IF;
  IF (SELECT stage FROM leads WHERE id = v_lost) <> 'lost' THEN RAISE EXCEPTION 'FAIL a lost lead was revived'; END IF;
  IF (SELECT converted_account_id FROM leads WHERE id = v_other_studio) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a lead in another studio was linked';
  END IF;
  RAISE NOTICE 'ok  one email match → won and linked; lost leads and other studios untouched';
END $$;

-- ── 2. Phone match (local vs +972 format) ──────────────────────────────────
DO $$
DECLARE v_b uuid := (SELECT b FROM pg_temp.ids); v_lead uuid; v_eng uuid;
BEGIN
  v_lead := pg_temp.lead(v_b, 'Yael', NULL, '050-123 4567');
  v_eng := pg_temp.enrol(v_b, pg_temp.family(v_b, '2', NULL, '+972 50 1234567'), (SELECT cls FROM pg_temp.ids));
  IF (SELECT converted_engagement_id FROM leads WHERE id = v_lead) IS DISTINCT FROM v_eng THEN
    RAISE EXCEPTION 'FAIL phone match not linked';
  END IF;
  RAISE NOTICE 'ok  phone match across formats → linked';
END $$;

-- ── 3. Several matching leads → suggestions only ────────────────────────────
DO $$
DECLARE v_b uuid := (SELECT b FROM pg_temp.ids); v_l1 uuid; v_l2 uuid; v_eng uuid;
BEGIN
  v_l1 := pg_temp.lead(v_b, 'Noa', 'twins@example.test', NULL);
  v_l2 := pg_temp.lead(v_b, 'Noa again', 'twins@example.test', NULL, 'contacted');
  v_eng := pg_temp.enrol(v_b, pg_temp.family(v_b, '3', 'twins@example.test', NULL), (SELECT cls FROM pg_temp.ids));
  IF (SELECT count(*) FROM leads WHERE id IN (v_l1, v_l2) AND suggested_engagement_id = v_eng AND converted_account_id IS NULL) <> 2 THEN
    RAISE EXCEPTION 'FAIL ambiguous matches should both be suggestions, not linked';
  END IF;
  RAISE NOTICE 'ok  two matching leads → both suggested, neither linked';
END $$;

-- ── 4. Photographer appointments are untouched ──────────────────────────────
DO $$
DECLARE v_b uuid := (SELECT b FROM pg_temp.ids); v_lead uuid;
BEGIN
  v_lead := pg_temp.lead(v_b, 'Shoot client', 'shoot@example.test', NULL, 'proposal');
  PERFORM pg_temp.enrol(v_b, pg_temp.family(v_b, '4', 'shoot@example.test', NULL), (SELECT appt FROM pg_temp.ids));
  IF (SELECT stage FROM leads WHERE id = v_lead) <> 'proposal'
     OR (SELECT suggested_engagement_id FROM leads WHERE id = v_lead) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL an appointment (photographer job) touched a lead';
  END IF;
  RAISE NOTICE 'ok  appointments (photographer jobs) leave leads alone';
END $$;

-- ── 5. Links stay inside the studio; new stages accepted ────────────────────
DO $$
DECLARE v_b uuid := (SELECT b FROM pg_temp.ids); v_c uuid := (SELECT c FROM pg_temp.ids); v_eng_c uuid; v_lead uuid;
BEGIN
  v_eng_c := pg_temp.enrol(v_c, pg_temp.family(v_c, '5', NULL, NULL), (SELECT cls_c FROM pg_temp.ids));
  v_lead := pg_temp.lead(v_b, 'Cross', NULL, NULL, 'trial_booked');
  BEGIN
    UPDATE leads SET suggested_engagement_id = v_eng_c WHERE id = v_lead;
    RAISE EXCEPTION 'FAIL a lead pointed at another studio''s enrolment';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE leads SET stage = 'enrolled' WHERE id = v_lead;
    RAISE EXCEPTION 'FAIL an unknown stage was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok  enrolment links stay in the studio; stage list enforced';
END $$;

-- ── 6. An enrolment never fails because of lead matching ────────────────────
DO $$
DECLARE v_b uuid := (SELECT b FROM pg_temp.ids); v_child uuid;
BEGIN
  v_child := pg_temp.family(v_b, '6', NULL, NULL);
  PERFORM pg_temp.enrol(v_b, v_child, (SELECT cls FROM pg_temp.ids));
  IF lead_phone_key('12') IS NOT NULL OR lead_phone_key('+972-50-123-4567') <> '501234567' THEN
    RAISE EXCEPTION 'FAIL lead_phone_key';
  END IF;
  RAISE NOTICE 'ok  enrolment without contact details goes through; phone key';
END $$;

ROLLBACK;
SQL
echo "lead-pipeline: all checks passed"
