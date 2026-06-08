-- Smoke checks after applying migrations + seed.sql (creativeballet tenant).
-- Run in Supabase SQL Editor or: psql $DATABASE_URL -f supabase/scripts/verify-seed.sql

\set tenant_id '00000000-0000-0000-0000-000000000001'

-- Expect 7 Monday offerings, all 24000 agorot, all waiver_required = true
SELECT
  name,
  day_of_week,
  start_time,
  min_age,
  max_age,
  price_minor,
  waiver_required
FROM offerings
WHERE tenant_id = :'tenant_id'::uuid
ORDER BY start_time;

-- Seed people
SELECT name, account_id, email
FROM people
WHERE tenant_id = :'tenant_id'::uuid
ORDER BY name;

-- Parent auth link sanity (hosted: run scripts/seed-auth-parent.mjs first)
SELECT
  up.email AS profile_email,
  gp.name  AS guardian_name,
  am.user_profile_id IS NOT NULL AS guardian_linked
FROM user_profiles up
LEFT JOIN account_members am ON am.user_profile_id = up.id
LEFT JOIN people gp ON gp.id = am.person_id
WHERE up.email = 'miriamrstern@gmail.com';

DO $$
DECLARE
  v_tenant_id        UUID := '00000000-0000-0000-0000-000000000001';
  v_offering_count   INT;
  v_bad_price        INT;
  v_waiver_off       INT;
  v_season_count     INT;
  v_active_seasons   INT;
  v_people_count     INT;
  v_template_count   INT;
  v_active_templates INT;
  v_evidence_count   INT;
  v_evidence_offered INT;
  v_from_email       TEXT;
  v_admin_count      INT;
BEGIN
  -- Offerings: 7 at 24000, all waiver_required
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE price_minor <> 24000),
         COUNT(*) FILTER (WHERE waiver_required IS NOT TRUE)
    INTO v_offering_count, v_bad_price, v_waiver_off
    FROM offerings WHERE tenant_id = v_tenant_id;

  IF v_offering_count <> 7 THEN
    RAISE EXCEPTION 'Expected 7 offerings, found %', v_offering_count;
  END IF;
  IF v_bad_price > 0 THEN
    RAISE EXCEPTION 'Expected all offerings at 24000 agorot, % mismatched', v_bad_price;
  END IF;
  IF v_waiver_off > 0 THEN
    RAISE EXCEPTION 'Expected all offerings waiver_required=true, % were not', v_waiver_off;
  END IF;

  -- Seasons: 2 total, exactly 1 active
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'active')
    INTO v_season_count, v_active_seasons
    FROM seasons WHERE tenant_id = v_tenant_id;
  IF v_season_count < 2 THEN
    RAISE EXCEPTION 'Expected >= 2 seasons, found %', v_season_count;
  END IF;
  IF v_active_seasons <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 active season, found %', v_active_seasons;
  END IF;

  -- People present
  SELECT COUNT(*) INTO v_people_count FROM people WHERE tenant_id = v_tenant_id;
  IF v_people_count < 4 THEN
    RAISE EXCEPTION 'Expected >= 4 people, found %', v_people_count;
  END IF;

  -- Consent template: at least 1 active waiver
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'active')
    INTO v_template_count, v_active_templates
    FROM consent_templates WHERE tenant_id = v_tenant_id;
  IF v_active_templates < 1 THEN
    RAISE EXCEPTION 'Expected >= 1 active consent_template, found % active (% total)',
      v_active_templates, v_template_count;
  END IF;

  -- Waiver evidence: at least 1 row, all with offering_id set (offering-linked)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE offering_id IS NOT NULL)
    INTO v_evidence_count, v_evidence_offered
    FROM waiver_evidence WHERE tenant_id = v_tenant_id;
  IF v_evidence_count < 1 THEN
    RAISE EXCEPTION 'Expected >= 1 waiver_evidence row, found %', v_evidence_count;
  END IF;
  IF v_evidence_offered < 1 THEN
    RAISE EXCEPTION 'Expected waiver_evidence rows to set offering_id, none did';
  END IF;

  -- Tenant from_email configured
  SELECT from_email INTO v_from_email FROM tenants WHERE id = v_tenant_id;
  IF v_from_email IS NULL OR trim(v_from_email) = '' THEN
    RAISE EXCEPTION 'Expected tenants.from_email to be set';
  END IF;

  -- At least one super_admin / tenant_admin
  SELECT COUNT(*) INTO v_admin_count
    FROM user_profiles
    WHERE tenant_id = v_tenant_id
      AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role));
  IF v_admin_count < 1 THEN
    RAISE EXCEPTION 'Expected >= 1 admin user_profile, found %', v_admin_count;
  END IF;

  RAISE NOTICE 'PASS: % offerings @24000 (waiver on), % active season, % people, % active template(s), % waiver evidence row(s), from_email=%, % admin(s)',
    v_offering_count, v_active_seasons, v_people_count, v_active_templates, v_evidence_count, v_from_email, v_admin_count;
END $$;
