-- user_profiles: "admins manage profiles" must check the CALLER, not the row.
-- Fixture (client-portal/10_seed.sql): photographer studio with admin (…0e) and
-- clients Alice (…0a) and Bob (…0b); dance studio with parent Dina (…0d).
-- Raises on the first failed expectation.
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

-- Runs one statement as a signed-in user and returns the number of rows it touched.
CREATE OR REPLACE FUNCTION pg_temp.as_user(uid UUID, stmt TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE stmt;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  RETURN n::text;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.count_as(uid UUID, where_clause TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE 'SELECT count(*) FROM user_profiles WHERE ' || where_clause INTO n;
  EXECUTE 'RESET ROLE';
  RETURN n::text;
END $$;

\set alice '''b0000000-0000-4000-8000-00000000000a'''
\set bob   '''b0000000-0000-4000-8000-00000000000b'''
\set dina  '''b0000000-0000-4000-8000-00000000000d'''
\set admin '''b0000000-0000-4000-8000-00000000000e'''

-- A client (Alice) and a parent of another studio (Dina) cannot touch the admin's row.
BEGIN;
SELECT pg_temp.expect('client cannot read the admin row',
  pg_temp.count_as(:alice, 'id = ' || quote_literal(:admin)), '0');
SELECT pg_temp.expect('client still reads own row',
  pg_temp.count_as(:alice, 'id = ' || quote_literal(:alice)), '1');
SELECT pg_temp.expect('client reads no other row',
  pg_temp.count_as(:alice, 'id <> ' || quote_literal(:alice)), '0');
SELECT pg_temp.expect('client cannot edit the admin row',
  pg_temp.as_user(:alice, 'UPDATE user_profiles SET email = ''taken@x.test'' WHERE id = ' || quote_literal(:admin)), '0');
SELECT pg_temp.expect('client cannot delete the admin row',
  pg_temp.as_user(:alice, 'DELETE FROM user_profiles WHERE id = ' || quote_literal(:admin)), '0');
SELECT pg_temp.expect('client cannot make themself admin',
  pg_temp.as_user(:alice, 'UPDATE user_profiles SET role = ARRAY[''tenant_admin''] WHERE id = ' || quote_literal(:alice)), '0');
SELECT pg_temp.expect('other studio parent cannot read the admin row',
  pg_temp.count_as(:dina, 'id = ' || quote_literal(:admin)), '0');
SELECT pg_temp.expect('other studio parent cannot delete the admin row',
  pg_temp.as_user(:dina, 'DELETE FROM user_profiles WHERE id = ' || quote_literal(:admin)), '0');
COMMIT;

SELECT pg_temp.expect('admin row unchanged',
  (SELECT email || '|' || array_to_string(role, ',') FROM user_profiles WHERE id = :admin),
  'admin@x.test|tenant_admin');
SELECT pg_temp.expect('client role unchanged',
  (SELECT array_to_string(role, ',') FROM user_profiles WHERE id = :alice), 'account_holder');

-- The admin manages their own studio's profiles, and only those.
BEGIN;
SELECT pg_temp.expect('admin reads every profile of their studio',
  pg_temp.count_as(:admin, 'tenant_id = ''a0000000-0000-4000-8000-000000000001'''), '4');
SELECT pg_temp.expect('admin cannot read another studio''s profile',
  pg_temp.count_as(:admin, 'id = ' || quote_literal(:dina)), '0');
SELECT pg_temp.expect('admin can edit a client profile of their studio',
  pg_temp.as_user(:admin, 'UPDATE user_profiles SET updated_at = now() WHERE id = ' || quote_literal(:bob)), '1');
SELECT pg_temp.expect('admin cannot edit another studio''s profile',
  pg_temp.as_user(:admin, 'UPDATE user_profiles SET updated_at = now() WHERE id = ' || quote_literal(:dina)), '0');
COMMIT;

-- An admin cannot move a profile into another studio (WITH CHECK).
DO $$
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-00000000000e', true);
    SET LOCAL ROLE authenticated;
    UPDATE user_profiles SET tenant_id = 'a0000000-0000-4000-8000-000000000002'
     WHERE id = 'b0000000-0000-4000-8000-00000000000b';
    RAISE EXCEPTION 'FAIL admin moved a profile to another studio';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  admin cannot move a profile to another studio';
  END;
END $$;
RESET ROLE;
