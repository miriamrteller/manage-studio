-- Teacher logins (20261111084600_teacher_logins.sql). Builds on client-portal/10_seed.sql:
-- dance studio D (…0002) with parent Dina (…0d). Adds an admin, three teacher logins
-- and two classes. Raises on the first failed expectation.
\set ON_ERROR_STOP 1
\pset tuples_only on
\o /dev/null

CREATE OR REPLACE FUNCTION pg_temp.expect(label TEXT, actual TEXT, expected TEXT) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL %: expected [%], got [%]', label, expected, actual;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- Runs a query as a signed-in user and returns its first column as text.
CREATE OR REPLACE FUNCTION pg_temp.q(uid UUID, sql TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE sql INTO v;
  EXECUTE 'RESET ROLE';
  RETURN v;
END $$;

-- Runs a statement as a signed-in user; returns rows touched, or 'denied'.
CREATE OR REPLACE FUNCTION pg_temp.run(uid UUID, sql TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE sql;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'RESET ROLE';
    RETURN 'denied';
  END;
  EXECUTE 'RESET ROLE';
  RETURN n::text;
END $$;

\set D     '''a0000000-0000-4000-8000-000000000002'''
\set dina  '''b0000000-0000-4000-8000-00000000000d'''
\set admin '''b0000000-0000-4000-8000-0000000000a1'''
\set t1    '''b0000000-0000-4000-8000-0000000000f1'''
\set t2    '''b0000000-0000-4000-8000-0000000000f2'''
\set t3    '''b0000000-0000-4000-8000-0000000000f3'''
\set s1    '''90000000-0000-4000-8000-000000000001'''
\set s2    '''90000000-0000-4000-8000-000000000002'''
\set s3    '''90000000-0000-4000-8000-000000000003'''
\set o1    '''e1000000-0000-4000-8000-000000000001'''
\set o2    '''e1000000-0000-4000-8000-000000000002'''
\set ses1  '''e2000000-0000-4000-8000-000000000001'''
\set ses2  '''e2000000-0000-4000-8000-000000000002'''

SET session_replication_role = replica;
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
 (:admin, 'dance-admin@x.test', now()),
 (:t1, 't1@x.test', now()),
 (:t2, 't2@x.test', now()),
 (:t3, 't3@x.test', NULL);                 -- email not confirmed
INSERT INTO user_profiles (id, tenant_id, role, email) VALUES
 (:admin, :D, '{tenant_admin}', 'dance-admin@x.test'),
 (:t1, :D, '{account_holder}', 't1@x.test'),
 (:t2, :D, '{account_holder}', 't2@x.test'),
 (:t3, :D, '{account_holder}', 't3@x.test');
SET session_replication_role = origin;

-- The admin adds three teachers; an attempt to set the login link directly is ignored.
BEGIN;
SELECT pg_temp.expect('admin adds teachers', pg_temp.run(:admin, format(
  'INSERT INTO staff (id, tenant_id, name, email, user_profile_id) VALUES
     (%L, %L, ''Teacher One'', '' T1@X.test '', NULL),
     (%L, %L, ''Teacher Two'', ''t2@x.test'', %L),
     (%L, %L, ''Teacher Three'', ''t3@x.test'', NULL)',
  :s1, :D, :s2, :D, :t1, :s3, :D)), '3');
COMMIT;
SELECT pg_temp.expect('a login link typed in by the admin is dropped',
  (SELECT coalesce(user_profile_id::text, 'none') FROM staff WHERE id = :s2), 'none');
SELECT pg_temp.expect('email is trimmed', (SELECT email FROM staff WHERE id = :s1), 'T1@X.test');

SET session_replication_role = replica;
INSERT INTO offerings (id, tenant_id, name, offering_type, staff_id, day_of_week, start_time, end_time) VALUES
 (:o1, :D, 'Ballet 1', 'class', :s1, 1, '16:00', '17:00'),
 (:o2, :D, 'Ballet 2', 'class', :s2, 2, '16:00', '17:00');
INSERT INTO offering_sessions (id, tenant_id, offering_id, session_date, start_time, end_time) VALUES
 (:ses1, :D, :o1, current_date, '16:00', '17:00'),
 (:ses2, :D, :o2, current_date, '16:00', '17:00');
INSERT INTO engagements (tenant_id, person_id, offering_id, status) VALUES
 (:D, 'c0000000-0000-4000-8000-00000000000d', :o1, 'active');
SET session_replication_role = origin;

-- Before linking, a teacher login sees nothing of the classes.
BEGIN;
SELECT pg_temp.expect('unlinked: no sessions', pg_temp.q(:t1, 'SELECT count(*) FROM offering_sessions'), '0');
COMMIT;

-- Linking by confirmed email (case-insensitive).
BEGIN;
SELECT pg_temp.expect('t1 links', pg_temp.q(:t1, 'SELECT link_my_teacher_login()::text'), 'true');
SELECT pg_temp.expect('t3 (email not confirmed) does not link', pg_temp.q(:t3, 'SELECT link_my_teacher_login()::text'), 'false');
SELECT pg_temp.expect('a parent is not a teacher', pg_temp.q(:dina, 'SELECT link_my_teacher_login()::text'), 'false');
COMMIT;
SELECT pg_temp.expect('t1 has the staff role',
  (SELECT array_to_string(role, ',') FROM user_profiles WHERE id = :t1), 'account_holder,staff');
SELECT pg_temp.expect('t1 linked to their staff row', (SELECT user_profile_id::text FROM staff WHERE id = :s1), :t1);
SELECT pg_temp.expect('t3 not linked', (SELECT coalesce(user_profile_id::text, 'none') FROM staff WHERE id = :s3), 'none');
SELECT pg_temp.expect('calling again changes nothing',
  pg_temp.q(:t1, 'SELECT link_my_teacher_login()::text') || (SELECT array_to_string(role, ',') FROM user_profiles WHERE id = :t1),
  'trueaccount_holder,staff');

-- Setting off (default): a teacher sees every class of the studio, own first.
BEGIN;
SELECT pg_temp.expect('setting off: My classes lists all classes, own first',
  pg_temp.q(:t1, $$SELECT string_agg((c->>'name') || ':' || (c->>'mine') || ':' || (c->>'enrolled'), ',') FROM jsonb_array_elements(get_my_teaching()->'classes') c$$),
  'Ballet 1:true:1,Ballet 2:false:0');
SELECT pg_temp.expect('My classes has the teacher name and the setting',
  pg_temp.q(:t1, $$SELECT (get_my_teaching()->>'teacher_names') || (get_my_teaching()->>'own_classes_only')$$), '["Teacher One"]false');
SELECT pg_temp.expect('setting off: teacher sees every session',
  pg_temp.q(:t1, 'SELECT count(*) FROM offering_sessions'), '2');
SELECT pg_temp.expect('setting off: teacher marks attendance in another class',
  pg_temp.run(:t1, format('INSERT INTO attendance (tenant_id, session_id, person_id, attended) VALUES (%L, %L, ''c0000000-0000-4000-8000-00000000000d'', true)', :D, :ses2)), '1');
SELECT pg_temp.expect('teacher cannot change sessions',
  pg_temp.run(:t1, 'UPDATE offering_sessions SET end_time = ''18:00'''), '0');
SELECT pg_temp.expect('teacher cannot delete sessions',
  pg_temp.run(:t1, 'DELETE FROM offering_sessions'), '0');
SELECT pg_temp.expect('teacher reads only own staff row',
  pg_temp.q(:t1, 'SELECT string_agg(name, '','') FROM staff'), 'Teacher One');
SELECT pg_temp.expect('setting off: teacher opens the register of another class',
  pg_temp.run(:t1, format('SELECT get_class_register(%L, current_date)', :o2)), '1');
SELECT pg_temp.expect('a parent cannot open a register',
  pg_temp.run(:dina, format('SELECT get_class_register(%L, current_date)', :o1)), 'denied');
SELECT pg_temp.expect('a parent cannot turn the setting on',
  pg_temp.run(:dina, format('UPDATE tenants SET teachers_own_classes_only = true WHERE id = %L', :D)), '0');
SELECT pg_temp.expect('the admin turns the setting on',
  pg_temp.run(:admin, format('UPDATE tenants SET teachers_own_classes_only = true WHERE id = %L', :D)), '1');
COMMIT;

-- Setting on: only the classes they teach.
BEGIN;
SELECT pg_temp.expect('setting on: My classes lists only own class',
  pg_temp.q(:t1, $$SELECT string_agg((c->>'name'), ',') FROM jsonb_array_elements(get_my_teaching()->'classes') c$$),
  'Ballet 1');
SELECT pg_temp.expect('setting on: teacher sees own sessions only',
  pg_temp.q(:t1, 'SELECT string_agg(offering_id::text, '','') FROM offering_sessions'), :o1);
SELECT pg_temp.expect('setting on: teacher marks attendance in own class',
  pg_temp.run(:t1, format('INSERT INTO attendance (tenant_id, session_id, person_id, attended) VALUES (%L, %L, ''c0000000-0000-4000-8000-00000000000d'', true)', :D, :ses1)), '1');
SELECT pg_temp.expect('setting on: teacher cannot mark attendance in another class',
  pg_temp.run(:t1, format('INSERT INTO attendance (tenant_id, session_id, person_id, attended) VALUES (%L, %L, ''c0000000-0000-4000-8000-00000000000d'', false)', :D, :ses2)), 'denied');
SELECT pg_temp.expect('setting on: teacher opens own register',
  pg_temp.run(:t1, format('SELECT get_class_register(%L, current_date)', :o1)), '1');
SELECT pg_temp.expect('setting on: teacher cannot open another class register',
  pg_temp.run(:t1, format('SELECT get_class_register(%L, current_date)', :o2)), 'denied');
SELECT pg_temp.expect('setting on: teacher cannot see attendance of another class',
  pg_temp.q(:t1, format('SELECT count(*) FROM attendance WHERE session_id = %L', :ses2)), '0');
COMMIT;

-- Parents no longer read the staff table, but still see teacher names.
BEGIN;
SELECT pg_temp.expect('parent cannot read staff', pg_temp.q(:dina, 'SELECT count(*) FROM staff'), '0');
SELECT pg_temp.expect('parent sees teacher names',
  pg_temp.q(:dina, 'SELECT string_agg(name, '','' ORDER BY name) FROM staff_names'), 'Teacher One,Teacher Three,Teacher Two');
SELECT pg_temp.expect('staff_names shows only own studio',
  pg_temp.q('b0000000-0000-4000-8000-00000000000a', 'SELECT count(*) FROM staff_names'), '0');
SELECT pg_temp.expect('admin still reads all staff', pg_temp.q(:admin, 'SELECT count(*) FROM staff'), '3');
SELECT pg_temp.expect('parent sees only the sessions of their own class',
  pg_temp.q(:dina, 'SELECT string_agg(offering_id::text, '','') FROM offering_sessions'), :o1);
COMMIT;

-- Changing the teacher's email unlinks the login and takes the role away.
BEGIN;
SELECT pg_temp.expect('admin changes t1 email',
  pg_temp.run(:admin, format('UPDATE staff SET email = ''new@x.test'' WHERE id = %L', :s1)), '1');
COMMIT;
SELECT pg_temp.expect('changed email unlinks', (SELECT coalesce(user_profile_id::text, 'none') FROM staff WHERE id = :s1), 'none');
SELECT pg_temp.expect('changed email removes the staff role',
  (SELECT array_to_string(role, ',') FROM user_profiles WHERE id = :t1), 'account_holder');
BEGIN;
SELECT pg_temp.expect('unlinked teacher sees no sessions', pg_temp.q(:t1, 'SELECT count(*) FROM offering_sessions'), '0');
COMMIT;

-- Removing a teacher takes the role away.
BEGIN;
SELECT pg_temp.expect('the profile read links a teacher (get_my_profile)',
  pg_temp.q(:t2, 'SELECT array_to_string(role, '','') FROM get_my_profile()'), 'account_holder,staff');
SELECT pg_temp.expect('admin removes teacher two',
  pg_temp.run(:admin, format('UPDATE offerings SET staff_id = NULL WHERE staff_id = %L', :s2)) || '/' ||
  pg_temp.run(:admin, format('DELETE FROM staff WHERE id = %L', :s2)), '1/1');
COMMIT;
SELECT pg_temp.expect('removed teacher loses the staff role',
  (SELECT array_to_string(role, ',') FROM user_profiles WHERE id = :t2), 'account_holder');
