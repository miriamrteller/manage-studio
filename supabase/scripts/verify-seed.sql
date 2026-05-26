-- Smoke checks after applying migrations + seed.sql (creativeballet tenant)
-- Run in Supabase SQL Editor or: psql $DATABASE_URL -f supabase/scripts/verify-seed.sql

\set tenant_id '00000000-0000-0000-0000-000000000001'

-- Expect 7 Monday classes, all 24000 agorot
SELECT
  name,
  day_of_week,
  start_time,
  min_age,
  max_age,
  price_minor
FROM classes
WHERE tenant_id = :'tenant_id'::uuid
ORDER BY start_time;

DO $$
DECLARE
  v_count INT;
  v_bad_price INT;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE price_minor <> 24000)
  INTO v_count, v_bad_price
  FROM classes
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;

  IF v_count <> 7 THEN
    RAISE EXCEPTION 'Expected 7 classes, found %', v_count;
  END IF;
  IF v_bad_price > 0 THEN
    RAISE EXCEPTION 'Expected all classes at 24000 agorot, % mismatched', v_bad_price;
  END IF;
  RAISE NOTICE 'PASS: % Monday classes at 24000 agorot', v_count;
END $$;

-- Children + adult seed people
SELECT name, family_id, email
FROM people
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
ORDER BY name;

-- Parent auth link sanity (hosted: run scripts/seed-auth-parent.mjs first)
SELECT
  up.email AS profile_email,
  fm.name AS guardian_name,
  fm.user_profile_id IS NOT NULL AS guardian_linked
FROM user_profiles up
LEFT JOIN family_members fm ON fm.user_profile_id = up.id
WHERE up.email = 'miriamrstern@gmail.com';
