-- Client import: import_clients and client_import_matches.
CREATE TEMP TABLE ids AS SELECT
  gen_random_uuid() AS lens, gen_random_uuid() AS ballet, gen_random_uuid() AS other_studio,
  gen_random_uuid() AS lens_admin, gen_random_uuid() AS ballet_admin, gen_random_uuid() AS other_admin,
  gen_random_uuid() AS parent;
GRANT SELECT ON ids TO authenticated;

INSERT INTO tenants (id, name, subdomain, contact_email, skin, family_accounts)
SELECT lens, 'Lens studio', 'ci-' || substr(md5(random()::text), 1, 8), 'l@example.test', 'photographer', false FROM ids
UNION ALL
SELECT ballet, 'Ballet studio', 'ci-b-' || substr(md5(random()::text), 1, 8), 'b@example.test', 'dance-studio', true FROM ids
UNION ALL
SELECT other_studio, 'Other studio', 'ci-o-' || substr(md5(random()::text), 1, 8), 'o@example.test', 'generic', false FROM ids;

INSERT INTO auth.users (id, email)
SELECT lens_admin, 'ci-lens@example.test' FROM ids
UNION ALL SELECT ballet_admin, 'ci-ballet@example.test' FROM ids
UNION ALL SELECT other_admin, 'ci-other@example.test' FROM ids
UNION ALL SELECT parent, 'ci-parent@example.test' FROM ids;

INSERT INTO user_profiles (id, tenant_id, role, email)
SELECT lens_admin, lens, ARRAY['tenant_admin'], 'ci-lens@example.test' FROM ids
UNION ALL SELECT ballet_admin, ballet, ARRAY['tenant_admin'], 'ci-ballet@example.test' FROM ids
UNION ALL SELECT other_admin, other_studio, ARRAY['tenant_admin'], 'ci-other@example.test' FROM ids
UNION ALL SELECT parent, lens, ARRAY['parent'], 'ci-parent@example.test' FROM ids
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, email = EXCLUDED.email;

-- An existing photographer client, with a phone in contact preferences.
INSERT INTO people (tenant_id, name, email, status)
SELECT lens, 'Existing Client', 'existing@example.test', 'active' FROM ids;
INSERT INTO contact_preferences (tenant_id, person_id, email_opted_in, whatsapp_number, whatsapp_opted_in, whatsapp_verified)
SELECT lens, (SELECT id FROM people WHERE email = 'existing@example.test'), true, '+972 50-111-2222', false, false FROM ids;

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
  SELECT set_config('request.jwt.claim.sub', p_user::text, false);
$$;

CREATE FUNCTION pg_temp.error_of(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END;
$$;

DO $$
DECLARE
  v ids%ROWTYPE;
  v_res jsonb;
  v_rows jsonb;
  v_err text;
  v_person people%ROWTYPE;
  v_count int;
BEGIN
  SELECT * INTO v FROM ids;

  -- 0. The phone key: +972 and spaces don't matter.
  IF client_import_phone_key('+972 50-123-4567') IS DISTINCT FROM '0501234567'
     OR client_import_phone_key('050 1234567') IS DISTINCT FROM '0501234567'
     OR client_import_phone_key('12') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL phone key';
  END IF;
  RAISE NOTICE 'ok  phone numbers are matched without spaces or +972';

  -- 1. Only studio admins can import or check.
  PERFORM pg_temp.act_as(v.parent);
  v_err := pg_temp.error_of($q$SELECT import_clients('a.csv', NULL, '{}', '[{"name":"X"}]')$q$);
  IF v_err IS DISTINCT FROM 'Forbidden' THEN RAISE EXCEPTION 'FAIL parent import: %', v_err; END IF;
  v_err := pg_temp.error_of($q$SELECT client_import_matches('[{"name":"X"}]')$q$);
  IF v_err IS DISTINCT FROM 'Forbidden' THEN RAISE EXCEPTION 'FAIL parent matches: %', v_err; END IF;
  RAISE NOTICE 'ok  only studio admins can import';

  -- 2. Matches for the screen: email, phone, name.
  PERFORM pg_temp.act_as(v.lens_admin);
  v_res := client_import_matches(jsonb_build_array(
    jsonb_build_object('name', 'New Person', 'email', 'new@example.test'),
    jsonb_build_object('name', 'Someone', 'email', 'EXISTING@example.test'),
    jsonb_build_object('name', 'Someone Else', 'phone', '0501112222'),
    jsonb_build_object('name', 'existing client')
  ));
  IF jsonb_array_length(v_res) <> 3
     OR (v_res->0->>'index')::int <> 1 OR v_res->0->>'reason' <> 'email'
     OR (v_res->1->>'index')::int <> 2 OR v_res->1->>'reason' <> 'phone'
     OR (v_res->2->>'index')::int <> 3 OR v_res->2->>'reason' <> 'name' THEN
    RAISE EXCEPTION 'FAIL matches: %', v_res;
  END IF;
  RAISE NOTICE 'ok  the duplicate check finds email, phone and name matches';

  -- 3. Photographer import: own account, phone in contact preferences, students ignored,
  --    duplicates (existing client, and a repeat within the sheet) skipped.
  v_rows := jsonb_build_array(
    jsonb_build_object('name', 'Dana Client', 'email', 'Dana@Example.test', 'phone', '052-333-4444',
      'students', jsonb_build_array(jsonb_build_object('name', 'Ignored child'))),
    jsonb_build_object('name', 'Existing again', 'email', 'existing@example.test'),
    jsonb_build_object('name', 'Phone repeat', 'phone', '+972523334444'),
    jsonb_build_object('name', 'No Email', 'email', 'not-an-email')
  );
  v_res := import_clients('clients.csv', NULL, '{"Name":"name"}', v_rows);
  IF (v_res->>'clients')::int <> 2 OR (v_res->>'skipped')::int <> 2 OR (v_res->>'students')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL photographer import: %', v_res;
  END IF;
  SELECT * INTO v_person FROM people WHERE tenant_id = v.lens AND email = 'dana@example.test';
  IF v_person.account_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = v_person.account_id AND a.person_id = v_person.id)
     OR NOT EXISTS (SELECT 1 FROM account_members m WHERE m.person_id = v_person.id AND m.role = 'account_holder')
     OR NOT EXISTS (SELECT 1 FROM contact_preferences cp WHERE cp.person_id = v_person.id AND cp.whatsapp_number = '052-333-4444')
     OR NOT EXISTS (SELECT 1 FROM client_import_people ip WHERE ip.person_id = v_person.id) THEN
    RAISE EXCEPTION 'FAIL photographer client records';
  END IF;
  IF EXISTS (SELECT 1 FROM people WHERE tenant_id = v.lens AND name = 'Ignored child') THEN
    RAISE EXCEPTION 'FAIL photographer studios get no students';
  END IF;
  IF (SELECT email FROM people WHERE tenant_id = v.lens AND name = 'No Email') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a bad email should be left out';
  END IF;
  RAISE NOTICE 'ok  photographer clients get their own account; duplicates skipped';

  -- 4. Family studio: a parent with two students, and an adult with none.
  PERFORM pg_temp.act_as(v.ballet_admin);
  v_rows := jsonb_build_array(
    jsonb_build_object('name', 'Rina Parent', 'email', 'rina@example.test', 'phone', '054-555-6666',
      'family_name', 'Rina Parent family',
      'students', jsonb_build_array(
        jsonb_build_object('name', 'Child One', 'date_of_birth', '2016-04-03'),
        jsonb_build_object('name', 'Child Two', 'date_of_birth', 'not a date'))),
    jsonb_build_object('name', 'Adult Dancer', 'email', 'adult@example.test')
  );
  v_res := import_clients('roster.xlsx', 'Sheet1', '{}', v_rows);
  IF (v_res->>'clients')::int <> 2 OR (v_res->>'students')::int <> 2 OR (v_res->>'skipped')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL family import: %', v_res;
  END IF;
  SELECT * INTO v_person FROM people WHERE tenant_id = v.ballet AND email = 'rina@example.test';
  IF v_person.account_id IS NOT NULL OR v_person.emergency_contact_phone <> '054-555-6666' THEN
    RAISE EXCEPTION 'FAIL parent record';
  END IF;
  SELECT count(*) INTO v_count FROM people c
  JOIN accounts a ON a.id = c.account_id
  WHERE a.person_id = v_person.id AND a.name = 'Rina Parent family';
  IF v_count <> 2 THEN RAISE EXCEPTION 'FAIL expected 2 students, got %', v_count; END IF;
  IF (SELECT date_of_birth FROM people WHERE tenant_id = v.ballet AND name = 'Child One') <> DATE '2016-04-03'
     OR (SELECT date_of_birth FROM people WHERE tenant_id = v.ballet AND name = 'Child Two') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL student dates of birth';
  END IF;
  IF (SELECT account_id FROM people WHERE tenant_id = v.ballet AND email = 'adult@example.test') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL an adult client has no family account';
  END IF;
  RAISE NOTICE 'ok  family studios get parents, families and students; adults stay on their own';

  -- 5. Bad input is refused.
  v_err := pg_temp.error_of($q$SELECT import_clients('a.csv', NULL, '{}', '[{"email":"x@example.test"}]')$q$);
  IF v_err NOT LIKE '%name is required%' THEN RAISE EXCEPTION 'FAIL no name: %', v_err; END IF;
  v_err := pg_temp.error_of($q$SELECT import_clients('a.csv', NULL, '{}', '[]')$q$);
  IF v_err NOT LIKE '%no clients%' THEN RAISE EXCEPTION 'FAIL empty: %', v_err; END IF;
  RAISE NOTICE 'ok  invalid rows are refused';

  -- 6. Private to the studio: the other studio sees nothing and matches nothing.
  PERFORM pg_temp.act_as(v.other_admin);
  v_res := client_import_matches(jsonb_build_array(jsonb_build_object('name', 'Dana Client', 'email', 'dana@example.test')));
  IF jsonb_array_length(v_res) <> 0 THEN RAISE EXCEPTION 'FAIL other studio matched: %', v_res; END IF;
  v_res := import_clients('c.csv', NULL, '{}', jsonb_build_array(jsonb_build_object('name', 'Dana Client', 'email', 'dana@example.test')));
  IF (v_res->>'clients')::int <> 1 THEN RAISE EXCEPTION 'FAIL other studio import: %', v_res; END IF;
  RAISE NOTICE 'ok  imports and matches are private to the studio';
END;
$$;

-- 7. RLS: a studio admin reads only their own batches (as the authenticated role).
DO $$ BEGIN PERFORM pg_temp.act_as((SELECT lens_admin FROM ids)); END $$;
SET ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM client_import_batches) <> 1 THEN
    RAISE EXCEPTION 'FAIL lens admin should see exactly 1 batch, saw %', (SELECT count(*) FROM client_import_batches);
  END IF;
  RAISE NOTICE 'ok  studio admins see only their own import history';
END;
$$;
RESET ROLE;

-- 8. Past shoots: one finished shoot per client, existing clients included,
--    package found or added hidden, never twice, no shoot emails.
DO $$
DECLARE
  v ids%ROWTYPE;
  v_res jsonb;
  v_rows jsonb;
  v_existing uuid;
  v_dana uuid;
  v_pkg uuid;
  v_count int;
  v_recent date := (now() AT TIME ZONE 'Asia/Jerusalem')::date - 2;
BEGIN
  SELECT * INTO v FROM ids;
  PERFORM pg_temp.act_as(v.lens_admin);
  SELECT id INTO v_existing FROM people WHERE tenant_id = v.lens AND email = 'existing@example.test';
  SELECT id INTO v_dana FROM people WHERE tenant_id = v.lens AND email = 'dana@example.test';

  v_rows := jsonb_build_array(
    -- matched by the screen (person_id), dated two days ago
    jsonb_build_object('name', 'Existing Client', 'person_id', v_existing,
      'shoots', jsonb_build_array(jsonb_build_object('name', 'Family shoot', 'date', v_recent::text))),
    -- matched by email in the database, no date
    jsonb_build_object('name', 'Dana Client', 'email', 'dana@example.test',
      'shoots', jsonb_build_array(jsonb_build_object('name', '  family   SHOOT ', 'date', NULL))),
    -- a new client, date in the future is left out
    jsonb_build_object('name', 'New Shoot Client', 'email', 'newshoot@example.test',
      'shoots', jsonb_build_array(jsonb_build_object('name', 'Family shoot', 'date', '2999-01-01')))
  );
  v_res := import_clients('clients.csv', NULL, '{}', v_rows);
  IF (v_res->>'shoots')::int <> 3 OR (v_res->>'clients')::int <> 1 OR (v_res->>'skipped')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL past shoots import: %', v_res;
  END IF;

  SELECT count(*), min(o.id::text)::uuid INTO v_count, v_pkg FROM offerings o
  WHERE o.tenant_id = v.lens AND lower(o.name) = 'family shoot';
  IF v_count <> 1 OR (SELECT is_public FROM offerings WHERE id = v_pkg) THEN
    RAISE EXCEPTION 'FAIL one hidden package expected (% found)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM engagements e
  JOIN job_details jd ON jd.engagement_id = e.id
  JOIN client_import_shoots cis ON cis.engagement_id = e.id
  WHERE e.offering_id = v_pkg AND jd.job_status = 'delivered' AND e.season_id IS NULL;
  IF v_count <> 3 THEN RAISE EXCEPTION 'FAIL expected 3 delivered shoots, got %', v_count; END IF;
  IF (SELECT (e.booked_starts_at AT TIME ZONE 'Asia/Jerusalem')::date FROM engagements e
      WHERE e.person_id = v_existing AND e.offering_id = v_pkg) <> v_recent THEN
    RAISE EXCEPTION 'FAIL shoot date';
  END IF;
  IF EXISTS (SELECT 1 FROM engagements e JOIN people p ON p.id = e.person_id
             WHERE p.email = 'newshoot@example.test' AND e.booked_starts_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL a future date should be left out';
  END IF;
  IF (SELECT account_id FROM people WHERE id = v_existing) IS NULL THEN
    RAISE EXCEPTION 'FAIL an existing client gets an account for the shoot';
  END IF;
  RAISE NOTICE 'ok  each client gets one finished shoot on one hidden package';

  -- The same sheet again: nothing new.
  v_res := import_clients('clients.csv', NULL, '{}', v_rows);
  IF (v_res->>'shoots')::int <> 0 OR (v_res->>'clients')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL re-import added shoots: %', v_res;
  END IF;
  RAISE NOTICE 'ok  importing the sheet again adds no second shoot';

  -- An existing package with the name is used.
  INSERT INTO offerings (tenant_id, name, offering_type, duration_mins, price_minor)
  VALUES (v.lens, 'Newborn', 'appointment', 90, 50000) RETURNING id INTO v_pkg;
  v_res := import_clients('more.csv', NULL, '{}', jsonb_build_array(
    jsonb_build_object('name', 'Dana Client', 'person_id', v_dana,
      'shoots', jsonb_build_array(jsonb_build_object('name', 'newborn')))));
  IF (v_res->>'shoots')::int <> 1
     OR NOT EXISTS (SELECT 1 FROM engagements WHERE person_id = v_dana AND offering_id = v_pkg) THEN
    RAISE EXCEPTION 'FAIL existing package: %', v_res;
  END IF;
  RAISE NOTICE 'ok  a package with the same name is used';

  -- No shoot emails for imported shoots (the dated one is in the thank-you window).
  IF EXISTS (SELECT 1 FROM list_due_shoot_emails(now()) d
             JOIN client_import_shoots cis ON cis.engagement_id = d.engagement_id) THEN
    RAISE EXCEPTION 'FAIL imported shoots must not be emailed';
  END IF;
  RAISE NOTICE 'ok  imported shoots send no emails';

  -- A person_id from another studio is refused.
  PERFORM pg_temp.act_as(v.other_admin);
  IF pg_temp.error_of(format($q$SELECT import_clients('x.csv', NULL, '{}', '[{"name":"X","person_id":"%s"}]')$q$, v_dana))
     NOT LIKE '%client not found%' THEN
    RAISE EXCEPTION 'FAIL foreign person_id accepted';
  END IF;
  RAISE NOTICE 'ok  a client from another studio is refused';
END;
$$;
