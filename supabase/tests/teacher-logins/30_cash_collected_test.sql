-- "Cash collected" (20261115091000_teacher_cash_collected.sql). Runs after
-- 20_teacher_logins_test.sql in the same database: setting on, Teacher One (t1)
-- re-linked here, teaches Ballet 1 (o1) where Dina's child is enrolled.
\set ON_ERROR_STOP 1
\pset tuples_only on
\o /dev/null

\set D     '''a0000000-0000-4000-8000-000000000002'''
\set dina  '''b0000000-0000-4000-8000-00000000000d'''
\set admin '''b0000000-0000-4000-8000-0000000000a1'''
\set t1    '''b0000000-0000-4000-8000-0000000000f1'''
\set s1    '''90000000-0000-4000-8000-000000000001'''
\set o1    '''e1000000-0000-4000-8000-000000000001'''
\set o2    '''e1000000-0000-4000-8000-000000000002'''
\set kid   '''c0000000-0000-4000-8000-00000000000d'''

-- Teacher One back on t1's email, linked again; class price for the prefill.
UPDATE staff SET email = 't1@x.test' WHERE id = :s1;
UPDATE offerings SET price_minor = 25000 WHERE id = :o1;
BEGIN;
SELECT pg_temp.expect('t1 links again', pg_temp.q(:t1, 'SELECT link_my_teacher_login()::text'), 'true');
COMMIT;

BEGIN;
SELECT pg_temp.expect('register carries the class price',
  pg_temp.q(:t1, format($$SELECT (get_class_register(%L, current_date)->>'price_minor')$$, :o1)), '25000');
SELECT pg_temp.expect('teacher notes cash collected',
  pg_temp.run(:t1, format('SELECT set_cash_collected(%L, current_date, %L, 25000, ''paid at the door'')', :o1, :kid)), '1');
SELECT pg_temp.expect('a second tap updates the same note',
  pg_temp.run(:t1, format('SELECT set_cash_collected(%L, current_date, %L, 20000, NULL)', :o1, :kid)), '1');
SELECT pg_temp.expect('register shows the waiting note',
  pg_temp.q(:t1, format($$SELECT string_agg((s->'cash'->>'status') || ':' || (s->'cash'->>'amount_minor'), ',')
                         FROM jsonb_array_elements(get_class_register(%L, current_date)->'students') s$$, :o1)),
  'waiting:20000');
SELECT pg_temp.expect('teacher reads own note', pg_temp.q(:t1, 'SELECT count(*) FROM class_cash_notes'), '1');
SELECT pg_temp.expect('teacher cannot change a note directly',
  pg_temp.run(:t1, $$UPDATE class_cash_notes SET status = 'paid'$$), 'denied');
SELECT pg_temp.expect('teacher cannot note cash in another class',
  pg_temp.run(:t1, format('SELECT set_cash_collected(%L, current_date, %L, 100, NULL)', :o2, :kid)), 'denied');
SELECT pg_temp.expect('teacher cannot close a note',
  pg_temp.run(:t1, format($$SELECT resolve_cash_note((SELECT id FROM class_cash_notes LIMIT 1), 'paid')$$)), 'denied');
SELECT pg_temp.expect('teacher cannot list notes to confirm',
  pg_temp.run(:t1, 'SELECT get_cash_to_confirm()'), 'denied');
SELECT pg_temp.expect('a parent cannot note cash',
  pg_temp.run(:dina, format('SELECT set_cash_collected(%L, current_date, %L, 100, NULL)', :o1, :kid)), 'denied');
SELECT pg_temp.expect('a parent reads no notes', pg_temp.q(:dina, 'SELECT count(*) FROM class_cash_notes'), '0');
COMMIT;

SELECT pg_temp.expect('a note is not a payment',
  (SELECT count(*)::text FROM payments WHERE person_id = :kid), '0');

BEGIN;
SELECT pg_temp.expect('admin sees the note with teacher and class',
  pg_temp.q(:admin, $$SELECT string_agg((n->>'teacher_name') || '/' || (n->>'class_name') || '/' || (n->>'amount_minor'), ',')
                     FROM jsonb_array_elements(get_cash_to_confirm()) n$$),
  'Teacher One/Ballet 1/20000');
SELECT pg_temp.expect('admin marks it paid',
  pg_temp.q(:admin, $$SELECT (resolve_cash_note((SELECT id FROM class_cash_notes LIMIT 1), 'paid')).status$$), 'paid');
SELECT pg_temp.expect('nothing left to confirm',
  pg_temp.q(:admin, 'SELECT jsonb_array_length(get_cash_to_confirm())::text'), '0');
SELECT pg_temp.expect('register shows paid',
  pg_temp.q(:t1, format($$SELECT string_agg(s->'cash'->>'status', ',')
                         FROM jsonb_array_elements(get_class_register(%L, current_date)->'students') s$$, :o1)),
  'paid');
SELECT pg_temp.expect('a closed note cannot be taken back',
  pg_temp.q(:t1, format('SELECT clear_cash_collected(%L, current_date, %L)::text', :o1, :kid)), 'false');
COMMIT;

-- Tapped by mistake: the teacher takes it back; the admin can mark one not received.
BEGIN;
SELECT pg_temp.expect('teacher notes cash again (next week)',
  pg_temp.run(:t1, format('SELECT set_cash_collected(%L, current_date + 7, %L)', :o1, :kid)), '1');
SELECT pg_temp.expect('teacher takes it back',
  pg_temp.q(:t1, format('SELECT clear_cash_collected(%L, current_date + 7, %L)::text', :o1, :kid)), 'true');
SELECT pg_temp.expect('teacher notes cash (in two weeks)',
  pg_temp.run(:t1, format('SELECT set_cash_collected(%L, current_date + 14, %L)', :o1, :kid)), '1');
SELECT pg_temp.expect('admin marks it not received',
  pg_temp.q(:admin, $$SELECT (resolve_cash_note((SELECT id FROM class_cash_notes WHERE status = 'waiting'), 'not_received')).status$$),
  'not_received');
COMMIT;

-- Class card register follows the class rule (setting on: own classes only).
BEGIN;
SELECT pg_temp.expect('teacher opens own class card register',
  pg_temp.run(:t1, format('SELECT get_class_card_register(%L, current_date)', :o1)), '1');
SELECT pg_temp.expect('teacher cannot open another class card register',
  pg_temp.run(:t1, format('SELECT get_class_card_register(%L, current_date)', :o2)), 'denied');
COMMIT;
