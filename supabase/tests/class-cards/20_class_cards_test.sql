-- Class cards: the studio's switch, who can use a card, classes left, cancelling,
-- class size, sharing, expiry and the one-time extension, giving a class back.
-- Fixture: client-portal seed. Studio (…01): admin …0e, Alice …0a (account with Ari …0c),
-- Bob …0b. Two classes are added here: Yoga (covered) and Pilates (not covered).
\o /dev/null
CREATE TEMP TABLE ids AS SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid AS studio,
  'b0000000-0000-4000-8000-00000000000e'::uuid AS admin,
  'b0000000-0000-4000-8000-00000000000a'::uuid AS alice_u,
  'b0000000-0000-4000-8000-00000000000c'::uuid AS ari_u,
  'b0000000-0000-4000-8000-00000000000b'::uuid AS bob_u,
  'c0000000-0000-4000-8000-00000000000a'::uuid AS alice,
  'c0000000-0000-4000-8000-00000000000c'::uuid AS ari,
  'c0000000-0000-4000-8000-00000000000b'::uuid AS bob,
  'e0000000-0000-4000-8000-0000000000a1'::uuid AS yoga,
  'e0000000-0000-4000-8000-0000000000a2'::uuid AS pilates,
  -- A Yoga day 3 days from now, and the day after (no Yoga then).
  ((now() AT TIME ZONE 'Asia/Jerusalem')::date + 3) AS d1,
  ((now() AT TIME ZONE 'Asia/Jerusalem')::date + 4) AS d_none;
GRANT SELECT ON ids TO PUBLIC;

CREATE FUNCTION pg_temp.as_user(p_user UUID) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_user::text, false);
$$;

-- Runs p_sql as p_user and checks it fails with a message containing p_expect.
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

CREATE FUNCTION pg_temp.left_on(p_card UUID) RETURNS INT LANGUAGE sql AS $$
  SELECT private.class_card_classes_left(p_card);
$$;

-- Classes: Yoga runs on d1's weekday, 3 places; Pilates the same day.
INSERT INTO offerings (id, tenant_id, name, offering_type, day_of_week, start_time, end_time, max_capacity)
SELECT yoga, studio, 'Yoga', 'class', EXTRACT(DOW FROM d1)::int, '18:00', '19:00', 3 FROM ids;
INSERT INTO offerings (id, tenant_id, name, offering_type, day_of_week, start_time, end_time, max_capacity)
SELECT pilates, studio, 'Pilates', 'class', EXTRACT(DOW FROM d1)::int, '19:00', '20:00', 10 FROM ids;

CREATE TEMP TABLE t (k TEXT PRIMARY KEY, id UUID);
GRANT ALL ON t TO PUBLIC;

-- 1. Off by default: nothing can be sold or booked.
DO $$
DECLARE v UUID;
BEGIN
  INSERT INTO class_card_types (tenant_id, name, class_count, price_minor)
  SELECT studio, '10 classes', 10, 50000 FROM ids RETURNING id INTO v;
  INSERT INTO t VALUES ('ten', v);
  INSERT INTO class_card_type_offerings (card_type_id, tenant_id, offering_id) SELECT v, studio, yoga FROM ids;
  IF (SELECT valid_months FROM class_card_types WHERE id = v) <> 3 THEN RAISE EXCEPTION 'FAIL default expiry is not 3 months'; END IF;
  IF private.class_cards_enabled((SELECT studio FROM ids)) THEN RAISE EXCEPTION 'FAIL class cards on without a switch'; END IF;
  RAISE NOTICE 'ok  class cards are off by default; card type defaults to 3 months';
END $$;
SELECT pg_temp.expect_fail((SELECT admin FROM ids),
  format('SELECT issue_class_card(%L, %L)', (SELECT id FROM t WHERE k = 'ten'), (SELECT bob FROM ids)),
  'switched_off', 'cannot sell a card while switched off');

-- A card type can only cover the studio's own classes.
SELECT pg_temp.expect_fail((SELECT admin FROM ids),
  format('INSERT INTO class_card_type_offerings (card_type_id, tenant_id, offering_id) VALUES (%L, %L, %L)',
         (SELECT id FROM t WHERE k = 'ten'), (SELECT studio FROM ids), 'e0000000-0000-4000-8000-000000000001'),
  'not a class', 'card cannot cover an appointment');

-- 2. The admin switches it on; sells a card; the client books.
DO $$
DECLARE c class_cards; v class_card_visits;
BEGIN
  INSERT INTO tenant_class_card_settings (tenant_id, enabled) SELECT studio, true FROM ids;
  IF (SELECT cancel_cutoff_hours FROM tenant_class_card_settings) <> 12 THEN RAISE EXCEPTION 'FAIL cutoff default'; END IF;
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  c := issue_class_card((SELECT id FROM t WHERE k = 'ten'), (SELECT bob FROM ids));
  INSERT INTO t VALUES ('bob_card', c.id);
  IF c.status <> 'active' OR c.class_count <> 10 OR c.account_id IS NOT NULL
     OR c.valid_until <> (c.starts_on + interval '3 months')::date THEN
    RAISE EXCEPTION 'FAIL issued card wrong: %', row_to_json(c);
  END IF;
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  v := book_class_with_card(c.id, (SELECT yoga FROM ids), (SELECT d1 FROM ids));
  INSERT INTO t VALUES ('bob_visit', v.id);
  IF v.status <> 'booked' OR pg_temp.left_on(c.id) <> 9 THEN RAISE EXCEPTION 'FAIL booking did not use a class'; END IF;
  IF v.starts_at <> ((SELECT d1 FROM ids) + time '18:00') AT TIME ZONE 'Asia/Jerusalem' THEN
    RAISE EXCEPTION 'FAIL session start wrong: %', v.starts_at;
  END IF;
  RAISE NOTICE 'ok  admin sells a card (3 months), client books, 9 left';
END $$;

SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT book_class_with_card(%L, %L, %L)', (SELECT id FROM t WHERE k = 'bob_card'), (SELECT yoga FROM ids), (SELECT d1 FROM ids)),
  'already_booked', 'cannot book the same class twice');
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT book_class_with_card(%L, %L, %L)', (SELECT id FROM t WHERE k = 'bob_card'), (SELECT pilates FROM ids), (SELECT d1 FROM ids)),
  'class_not_covered', 'cannot book a class the card does not cover');
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT book_class_with_card(%L, %L, %L)', (SELECT id FROM t WHERE k = 'bob_card'), (SELECT yoga FROM ids), (SELECT d_none FROM ids)),
  'no_class_that_day', 'cannot book a day the class does not run');
SELECT pg_temp.expect_fail((SELECT alice_u FROM ids),
  format('SELECT book_class_with_card(%L, %L, %L)', (SELECT id FROM t WHERE k = 'bob_card'), (SELECT yoga FROM ids), (SELECT d1 FROM ids)),
  'access denied', 'another client cannot use the card');
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT issue_class_card(%L, %L)', (SELECT id FROM t WHERE k = 'ten'), (SELECT bob FROM ids)),
  'access denied', 'a client cannot give themselves a card');

-- 3. Cancelling: in time the class comes back; late it stays used.
DO $$
DECLARE v class_card_visits;
BEGIN
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  v := cancel_class_card_booking((SELECT id FROM t WHERE k = 'bob_visit'));
  IF v.status <> 'cancelled' OR pg_temp.left_on((SELECT id FROM t WHERE k = 'bob_card')) <> 10 THEN
    RAISE EXCEPTION 'FAIL in-time cancel did not give the class back';
  END IF;
  -- Cutoff of 7 days: the class 3 days away is now a late cancel.
  UPDATE tenant_class_card_settings SET cancel_cutoff_hours = 168;
  v := book_class_with_card((SELECT id FROM t WHERE k = 'bob_card'), (SELECT yoga FROM ids), (SELECT d1 FROM ids));
  v := cancel_class_card_booking(v.id);
  IF v.status <> 'late_cancelled' OR pg_temp.left_on((SELECT id FROM t WHERE k = 'bob_card')) <> 9 THEN
    RAISE EXCEPTION 'FAIL late cancel did not use the class';
  END IF;
  UPDATE t SET id = v.id WHERE k = 'bob_visit';
  UPDATE tenant_class_card_settings SET cancel_cutoff_hours = 12;
  RAISE NOTICE 'ok  cancel in time gives the class back; a late cancel uses it';
END $$;

-- 4. Giving a class back is for the admin only.
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT set_class_card_visit_status(%L, %L)', (SELECT id FROM t WHERE k = 'bob_visit'), 'returned'),
  'access denied', 'client cannot give a class back');
DO $$
DECLARE v class_card_visits;
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  v := set_class_card_visit_status((SELECT id FROM t WHERE k = 'bob_visit'), 'returned');
  IF v.status <> 'returned' OR pg_temp.left_on((SELECT id FROM t WHERE k = 'bob_card')) <> 10 THEN
    RAISE EXCEPTION 'FAIL give back did not return the class';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'class_card.returned') THEN RAISE EXCEPTION 'FAIL not audited'; END IF;
  RAISE NOTICE 'ok  admin gives a class back (audited)';
END $$;

-- 5. Class size: online booking stops at the limit; the teacher can still let a walk-in in.
DO $$
DECLARE c class_cards; v class_card_visits;
BEGIN
  UPDATE offerings SET max_capacity = 1 WHERE id = (SELECT yoga FROM ids);
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  c := issue_class_card((SELECT id FROM t WHERE k = 'ten'), (SELECT alice FROM ids));
  INSERT INTO t VALUES ('alice_card', c.id);
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  PERFORM book_class_with_card((SELECT id FROM t WHERE k = 'bob_card'), (SELECT yoga FROM ids), (SELECT d1 FROM ids));
END $$;
SELECT pg_temp.expect_fail((SELECT alice_u FROM ids),
  format('SELECT book_class_with_card(%L, %L, %L)', (SELECT id FROM t WHERE k = 'alice_card'), (SELECT yoga FROM ids), (SELECT d1 FROM ids)),
  'class_full', 'cannot book a full class');
DO $$
DECLARE v class_card_visits;
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  v := check_in_with_class_card((SELECT id FROM t WHERE k = 'alice_card'), (SELECT yoga FROM ids), (SELECT d1 FROM ids));
  IF v.status <> 'attended' OR NOT v.walk_in OR pg_temp.left_on((SELECT id FROM t WHERE k = 'alice_card')) <> 9 THEN
    RAISE EXCEPTION 'FAIL walk-in wrong';
  END IF;
  -- Ticking in someone who booked turns the booking into attended, without a second class.
  v := check_in_with_class_card((SELECT id FROM t WHERE k = 'bob_card'), (SELECT yoga FROM ids), (SELECT d1 FROM ids));
  IF v.status <> 'attended' OR v.walk_in OR pg_temp.left_on((SELECT id FROM t WHERE k = 'bob_card')) <> 9 THEN
    RAISE EXCEPTION 'FAIL check-in of a booking used another class';
  END IF;
  UPDATE offerings SET max_capacity = 3 WHERE id = (SELECT yoga FROM ids);
  RAISE NOTICE 'ok  full class stops online booking; walk-in allowed; booked check-in uses no extra class';
END $$;
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT check_in_with_class_card(%L, %L, %L)', (SELECT id FROM t WHERE k = 'bob_card'), (SELECT yoga FROM ids), (SELECT d1 FROM ids)),
  'access denied', 'a client cannot tick themselves in');

-- 6. No classes left.
DO $$
DECLARE v UUID; c class_cards;
BEGIN
  INSERT INTO class_card_types (tenant_id, name, class_count, price_minor, valid_months)
  SELECT studio, 'Single class', 1, 6000, NULL FROM ids RETURNING id INTO v;
  INSERT INTO class_card_type_offerings (card_type_id, tenant_id, offering_id) SELECT v, studio, yoga FROM ids;
  INSERT INTO class_card_type_offerings (card_type_id, tenant_id, offering_id) SELECT v, studio, pilates FROM ids;
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  c := issue_class_card(v, (SELECT bob FROM ids));
  IF c.valid_until IS NOT NULL THEN RAISE EXCEPTION 'FAIL no-expiry card got a date'; END IF;
  INSERT INTO t VALUES ('single', c.id);
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  PERFORM book_class_with_card(c.id, (SELECT pilates FROM ids), (SELECT d1 FROM ids));
  RAISE NOTICE 'ok  a card with no expiry has no end date';
END $$;
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT book_class_with_card(%L, %L, %L)', (SELECT id FROM t WHERE k = 'single'), (SELECT yoga FROM ids), (SELECT d1 + 7 FROM ids)),
  'no_classes_left', 'cannot book with no classes left');

-- 7. Sharing: a shared card works for anyone in the family account; a personal one only for its holder.
DO $$
DECLARE v UUID; c class_cards; vis class_card_visits;
BEGIN
  INSERT INTO class_card_types (tenant_id, name, class_count, price_minor, shareable)
  SELECT studio, 'Family 10', 10, 80000, true FROM ids RETURNING id INTO v;
  INSERT INTO class_card_type_offerings (card_type_id, tenant_id, offering_id) SELECT v, studio, yoga FROM ids;
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  c := issue_class_card(v, (SELECT alice FROM ids));
  IF c.account_id IS DISTINCT FROM 'd0000000-0000-4000-8000-00000000000a' THEN RAISE EXCEPTION 'FAIL shared card has no account'; END IF;
  INSERT INTO t VALUES ('family', c.id);
  PERFORM pg_temp.as_user((SELECT ari_u FROM ids));
  vis := book_class_with_card(c.id, (SELECT yoga FROM ids), (SELECT d1 + 7 FROM ids), (SELECT ari FROM ids));
  IF vis.person_id <> (SELECT ari FROM ids) THEN RAISE EXCEPTION 'FAIL shared booking for the wrong person'; END IF;
  RAISE NOTICE 'ok  shared card: a family member books for themselves';
END $$;
SELECT pg_temp.expect_fail((SELECT ari_u FROM ids),
  format('SELECT book_class_with_card(%L, %L, %L, %L)', (SELECT id FROM t WHERE k = 'alice_card'), (SELECT yoga FROM ids), (SELECT d1 + 7 FROM ids), (SELECT ari FROM ids)),
  'not_this_person', 'personal card cannot be used by someone else');
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT book_class_with_card(%L, %L, %L, %L)', (SELECT id FROM t WHERE k = 'family'), (SELECT yoga FROM ids), (SELECT d1 + 14 FROM ids), (SELECT bob FROM ids)),
  'access denied', 'shared card not usable outside the family');

-- 8. Expiry and the one-time extension.
DO $$
BEGIN
  UPDATE class_cards SET valid_until = (now() AT TIME ZONE 'Asia/Jerusalem')::date - 1,
                         starts_on = (now() AT TIME ZONE 'Asia/Jerusalem')::date - 100
   WHERE id = (SELECT id FROM t WHERE k = 'bob_card');
END $$;
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT book_class_with_card(%L, %L, %L)', (SELECT id FROM t WHERE k = 'bob_card'), (SELECT yoga FROM ids), (SELECT d1 + 7 FROM ids)),
  'expired', 'cannot book on an expired card');
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT extend_class_card(%L)', (SELECT id FROM t WHERE k = 'bob_card')),
  'access denied', 'a client cannot extend their own card');
DO $$
DECLARE c class_cards;
BEGIN
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  c := request_class_card_extension((SELECT id FROM t WHERE k = 'bob_card'));
  IF c.extension_requested_at IS NULL THEN RAISE EXCEPTION 'FAIL request not saved'; END IF;
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  c := extend_class_card(c.id);
  IF c.valid_until <> ((now() AT TIME ZONE 'Asia/Jerusalem')::date + interval '3 months')::date OR c.extended_at IS NULL THEN
    RAISE EXCEPTION 'FAIL extension wrong: %', c.valid_until;
  END IF;
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  PERFORM book_class_with_card(c.id, (SELECT yoga FROM ids), (SELECT d1 + 7 FROM ids));
  RAISE NOTICE 'ok  client asks, admin extends an expired card by 3 months from today; booking works again';
END $$;
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT request_class_card_extension(%L)', (SELECT id FROM t WHERE k = 'bob_card')),
  'already_asked', 'client can ask for more time only once');
SELECT pg_temp.expect_fail((SELECT admin FROM ids),
  format('SELECT extend_class_card(%L)', (SELECT id FROM t WHERE k = 'bob_card')),
  'already_extended', 'a card is extended only once');

-- 9. What clients see; switching off hides it.
DO $$
DECLARE n INT; l INT;
BEGIN
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  SELECT count(*), max(classes_left) FILTER (WHERE id = (SELECT id FROM t WHERE k = 'bob_card'))
    INTO n, l FROM get_my_class_cards();
  IF n <> 2 OR l <> 8 THEN RAISE EXCEPTION 'FAIL Bob sees % cards, % left', n, l; END IF;
  PERFORM pg_temp.as_user((SELECT ari_u FROM ids));
  IF (SELECT count(*) FROM get_my_class_cards()) <> 2 THEN RAISE EXCEPTION 'FAIL Ari should see the family and Alice cards'; END IF;
  UPDATE tenant_class_card_settings SET enabled = false;
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  IF EXISTS (SELECT 1 FROM get_my_class_cards()) THEN RAISE EXCEPTION 'FAIL cards shown while switched off'; END IF;
  UPDATE tenant_class_card_settings SET enabled = true;
  RAISE NOTICE 'ok  client sees own cards and classes left; nothing while switched off';
END $$;
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT * FROM get_person_class_cards(%L)', (SELECT alice FROM ids)),
  'access denied', 'a client cannot list someone else''s cards');

-- 10. Tables: clients read only their own rows and cannot write.
SET ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-00000000000b', false);
  IF EXISTS (SELECT 1 FROM class_cards WHERE person_id <> 'c0000000-0000-4000-8000-00000000000b') THEN
    RAISE EXCEPTION 'FAIL Bob reads other people''s cards';
  END IF;
  IF EXISTS (SELECT 1 FROM class_card_visits v JOIN class_cards c ON c.id = v.card_id
              WHERE c.person_id <> 'c0000000-0000-4000-8000-00000000000b') THEN
    RAISE EXCEPTION 'FAIL Bob reads other people''s visits';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM class_cards) THEN RAISE EXCEPTION 'FAIL Bob cannot read his own cards'; END IF;
  BEGIN
    UPDATE class_cards SET class_count = 500;
    RAISE EXCEPTION 'FAIL client updated a card';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO class_card_types (tenant_id, name, class_count, price_minor)
    VALUES ('a0000000-0000-4000-8000-000000000001', 'Free', 100, 0);
    RAISE EXCEPTION 'FAIL client created a card type';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE tenant_class_card_settings SET enabled = false;
    IF EXISTS (SELECT 1 FROM tenant_class_card_settings WHERE NOT enabled) THEN
      RAISE EXCEPTION 'FAIL client switched class cards off';
    END IF;
  END;
  RAISE NOTICE 'ok  clients read only their own cards and cannot write';
END $$;
RESET ROLE;

-- 11. The register: who booked or came, and which cards can take a walk-in.
DO $$
DECLARE r JSONB;
BEGIN
  PERFORM pg_temp.as_user((SELECT admin FROM ids));
  r := get_class_card_register((SELECT yoga FROM ids), (SELECT d1 FROM ids));
  IF NOT (r->>'runs')::bool THEN RAISE EXCEPTION 'FAIL register says the class does not run'; END IF;
  -- d1: Bob attended (booked, ticked in), Alice walked in.
  IF jsonb_array_length(r->'visits') <> 2
     OR NOT (r->'visits') @> '[{"name":"Alice","status":"attended","walk_in":true}]'
     OR NOT (r->'visits') @> '[{"name":"Bob","status":"attended","walk_in":false}]' THEN
    RAISE EXCEPTION 'FAIL register visits wrong: %', r->'visits';
  END IF;
  -- Cards covering Yoga with classes left: Bob's 10, Alice's 10, the family card (not the used-up single).
  IF jsonb_array_length(r->'cards') <> 3 OR (r->'cards') @> '[{"card_name":"Single class"}]' THEN
    RAISE EXCEPTION 'FAIL register cards wrong: %', r->'cards';
  END IF;
  r := get_class_card_register((SELECT yoga FROM ids), (SELECT d_none FROM ids));
  IF (r->>'runs')::bool THEN RAISE EXCEPTION 'FAIL register says Yoga runs on a day it does not'; END IF;
  RAISE NOTICE 'ok  register lists who came and the cards that can take a walk-in';
END $$;
SELECT pg_temp.expect_fail((SELECT bob_u FROM ids),
  format('SELECT get_class_card_register(%L, %L)', (SELECT yoga FROM ids), (SELECT d1 FROM ids)),
  'access denied', 'a client cannot read the register');

-- 12. Portal: the coming sessions a card covers, with places left and the holder's booking.
DO $$
DECLARE r JSONB; s JSONB;
BEGIN
  PERFORM pg_temp.as_user((SELECT bob_u FROM ids));
  r := get_my_class_card_sessions((SELECT id FROM t WHERE k = 'bob_card'), 14);
  IF (r->>'cancel_cutoff_hours')::int <> 12 THEN RAISE EXCEPTION 'FAIL cutoff not returned: %', r; END IF;
  IF jsonb_array_length(r->'sessions') <> 2 THEN RAISE EXCEPTION 'FAIL expected 2 Yoga sessions in 14 days: %', r->'sessions'; END IF;
  SELECT x INTO s FROM jsonb_array_elements(r->'sessions') x WHERE x->>'session_date' = (SELECT d1 FROM ids)::text;
  IF s->>'visit_status' <> 'attended' OR (s->>'places_left')::int <> 1 THEN RAISE EXCEPTION 'FAIL d1 session wrong: %', s; END IF;
  SELECT x INTO s FROM jsonb_array_elements(r->'sessions') x WHERE x->>'session_date' = ((SELECT d1 FROM ids) + 7)::text;
  IF s->>'visit_status' <> 'booked' OR s->>'name' <> 'Yoga' THEN RAISE EXCEPTION 'FAIL d1+7 session wrong: %', s; END IF;
  RAISE NOTICE 'ok  portal lists the coming sessions with places left and the booking';
END $$;
SELECT pg_temp.expect_fail((SELECT ari_u FROM ids),
  format('SELECT get_my_class_card_sessions(%L)', (SELECT id FROM t WHERE k = 'bob_card')),
  'access denied', 'someone else cannot list a card''s sessions');
