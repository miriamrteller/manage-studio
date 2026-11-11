-- Class register: who can take it, here / not here / clear, everyone at once,
-- only students of the class, and a day the class does not run.
-- Fixture: client-portal seed. Studio (…01): admin …0e, Alice …0a, Ari …0c, Bob …0b.
-- Dina (…0d) is a parent at another studio.
\o /dev/null
CREATE TEMP TABLE ids AS SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid AS studio,
  'b0000000-0000-4000-8000-00000000000e'::uuid AS admin,
  'b0000000-0000-4000-8000-00000000000a'::uuid AS alice_u,
  'b0000000-0000-4000-8000-00000000000d'::uuid AS dina_u,
  'b0000000-0000-4000-8000-0000000000f1'::uuid AS teacher_u,
  'c0000000-0000-4000-8000-00000000000a'::uuid AS alice,
  'c0000000-0000-4000-8000-00000000000c'::uuid AS ari,
  'c0000000-0000-4000-8000-00000000000b'::uuid AS bob,
  'e0000000-0000-4000-8000-0000000000b1'::uuid AS yoga,
  ((now() AT TIME ZONE 'Asia/Jerusalem')::date - 7) AS d1,
  ((now() AT TIME ZONE 'Asia/Jerusalem')::date - 6) AS d_none;
GRANT SELECT ON ids TO PUBLIC;

CREATE FUNCTION pg_temp.as_user(p_user UUID) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_user::text, false);
$$;

CREATE FUNCTION pg_temp.expect_fail(p_user UUID, p_sql TEXT, p_expect TEXT, p_label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_user(p_user);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%' || p_expect || '%' THEN
      RAISE EXCEPTION 'FAIL %: expected "%", got "%"', p_label, p_expect, SQLERRM;
    END IF;
    RAISE NOTICE 'ok  %', p_label;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL %: it worked but should not have', p_label;
END $$;

-- The mark for one person on the register (null when not marked).
CREATE FUNCTION pg_temp.mark(p_reg JSONB, p_person UUID) RETURNS TEXT LANGUAGE sql AS $$
  SELECT COALESCE(s->>'attended', 'unmarked') FROM jsonb_array_elements(p_reg->'students') s
   WHERE (s->>'person_id')::uuid = p_person;
$$;

-- A teacher (staff) at the studio.
SET session_replication_role = replica;
INSERT INTO auth.users (id, email) SELECT teacher_u, 'teacher@x.test' FROM ids;
INSERT INTO user_profiles (id, tenant_id, role, email) SELECT teacher_u, studio, '{staff}', 'teacher@x.test' FROM ids;
SET session_replication_role = DEFAULT;

-- Yoga runs on d1's weekday. Alice and Ari are enrolled; Bob is not.
INSERT INTO offerings (id, tenant_id, name, offering_type, day_of_week, start_time, end_time, max_capacity)
SELECT yoga, studio, 'Yoga', 'class', EXTRACT(DOW FROM d1)::int, '18:00', '19:00', 10 FROM ids;
INSERT INTO engagements (tenant_id, person_id, offering_id, status)
SELECT studio, alice, yoga, 'active' FROM ids UNION ALL
SELECT studio, ari, yoga, 'active' FROM ids;

-- 1. Who can take the register.
SELECT pg_temp.expect_fail((SELECT alice_u FROM ids),
  format('SELECT get_class_register(%L, %L)', (SELECT yoga FROM ids), (SELECT d1 FROM ids)),
  'access denied', 'a client cannot read the register');
SELECT pg_temp.expect_fail((SELECT dina_u FROM ids),
  format('SELECT set_class_attendance(%L, %L, ARRAY[%L]::uuid[], true)', (SELECT yoga FROM ids), (SELECT d1 FROM ids), (SELECT alice FROM ids)),
  'access denied', 'another studio cannot mark attendance');

-- 2. The register lists enrolled students, unmarked.
DO $$
DECLARE r JSONB;
BEGIN
  PERFORM pg_temp.as_user((SELECT teacher_u FROM ids));
  r := get_class_register((SELECT yoga FROM ids), (SELECT d1 FROM ids));
  IF NOT (r->>'runs')::boolean THEN RAISE EXCEPTION 'FAIL class should run on d1'; END IF;
  IF jsonb_array_length(r->'students') <> 2 THEN RAISE EXCEPTION 'FAIL expected 2 students, got %', r->'students'; END IF;
  IF pg_temp.mark(r, (SELECT alice FROM ids)) <> 'unmarked' THEN RAISE EXCEPTION 'FAIL Alice should be unmarked'; END IF;
  RAISE NOTICE 'ok  a teacher sees the enrolled students, unmarked';
END $$;

-- 3. Everyone here, then one not here, then clear.
DO $$
DECLARE r JSONB; n INT;
BEGIN
  PERFORM pg_temp.as_user((SELECT teacher_u FROM ids));
  n := set_class_attendance((SELECT yoga FROM ids), (SELECT d1 FROM ids),
         ARRAY[(SELECT alice FROM ids), (SELECT ari FROM ids)], true);
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL everyone here set % rows', n; END IF;
  PERFORM set_class_attendance((SELECT yoga FROM ids), (SELECT d1 FROM ids), ARRAY[(SELECT ari FROM ids)], false);
  r := get_class_register((SELECT yoga FROM ids), (SELECT d1 FROM ids));
  IF pg_temp.mark(r, (SELECT alice FROM ids)) <> 'true' OR pg_temp.mark(r, (SELECT ari FROM ids)) <> 'false' THEN
    RAISE EXCEPTION 'FAIL marks wrong: %', r;
  END IF;
  IF (SELECT marked_by FROM attendance WHERE person_id = (SELECT ari FROM ids)) <> (SELECT teacher_u FROM ids) THEN
    RAISE EXCEPTION 'FAIL marked_by not recorded';
  END IF;
  PERFORM set_class_attendance((SELECT yoga FROM ids), (SELECT d1 FROM ids), ARRAY[(SELECT ari FROM ids)], NULL);
  r := get_class_register((SELECT yoga FROM ids), (SELECT d1 FROM ids));
  IF pg_temp.mark(r, (SELECT ari FROM ids)) <> 'unmarked' THEN RAISE EXCEPTION 'FAIL clear did not clear'; END IF;
  RAISE NOTICE 'ok  everyone here, one not here, clear a mark';
END $$;

-- 4. Only students of the class; only on a day it runs.
SELECT pg_temp.expect_fail((SELECT admin FROM ids),
  format('SELECT set_class_attendance(%L, %L, ARRAY[%L]::uuid[], true)', (SELECT yoga FROM ids), (SELECT d1 FROM ids), (SELECT bob FROM ids)),
  'not_in_class', 'cannot mark someone not in the class');
SELECT pg_temp.expect_fail((SELECT admin FROM ids),
  format('SELECT set_class_attendance(%L, %L, ARRAY[%L]::uuid[], true)', (SELECT yoga FROM ids), (SELECT d_none FROM ids), (SELECT alice FROM ids)),
  'no_class_that_day', 'cannot mark a day the class does not run');

-- 5. A student who left the class still shows on a day they were marked.
DO $$
DECLARE r JSONB;
BEGIN
  UPDATE engagements SET status = 'withdrawn' WHERE person_id = (SELECT alice FROM ids) AND offering_id = (SELECT yoga FROM ids);
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  r := get_class_register((SELECT yoga FROM ids), (SELECT d1 FROM ids));
  IF pg_temp.mark(r, (SELECT alice FROM ids)) <> 'true' THEN RAISE EXCEPTION 'FAIL left student lost from past register: %', r; END IF;
  r := get_class_register((SELECT yoga FROM ids), (SELECT d1 FROM ids) + 7);
  IF pg_temp.mark(r, (SELECT alice FROM ids)) IS NOT NULL THEN RAISE EXCEPTION 'FAIL left student on a new register'; END IF;
  RAISE NOTICE 'ok  a student who left stays on past registers only';
END $$;

-- 6. A parent sees their own family's attendance (existing RLS).
SET ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-00000000000a', false);
  IF (SELECT count(*) FROM attendance) <> 1 THEN RAISE EXCEPTION 'FAIL Alice should see 1 attendance row'; END IF;
  PERFORM set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-00000000000b', false);
  IF (SELECT count(*) FROM attendance) <> 0 THEN RAISE EXCEPTION 'FAIL Bob should see none'; END IF;
  RAISE NOTICE 'ok  clients see only their own family''s attendance';
END $$;
RESET ROLE;
