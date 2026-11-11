CREATE TEMP TABLE ids AS SELECT
  gen_random_uuid() AS studio, gen_random_uuid() AS plain_studio,
  gen_random_uuid() AS c1, gen_random_uuid() AS c2, gen_random_uuid() AS c3, gen_random_uuid() AS other_kid,
  gen_random_uuid() AS family, gen_random_uuid() AS s_late, gen_random_uuid() AS s_soon,
  gen_random_uuid() AS o1, gen_random_uuid() AS o2, gen_random_uuid() AS o_soon, gen_random_uuid() AS appt,
  gen_random_uuid() AS o_plain;

INSERT INTO tenants (id, name, subdomain, contact_email, payment_provider, invoicing_provider)
SELECT studio, 'Ballet', 'cd-' || substr(md5(random()::text), 1, 8), 'b@example.test', 'grow', 'grow' FROM ids
UNION ALL SELECT plain_studio, 'Plain', 'cd-p-' || substr(md5(random()::text), 1, 8), 'p@example.test', 'grow', 'grow' FROM ids;

INSERT INTO people (id, tenant_id, name) SELECT c1, studio, 'Child one' FROM ids
UNION ALL SELECT c2, studio, 'Child two' FROM ids
UNION ALL SELECT c3, studio, 'Child three' FROM ids
UNION ALL SELECT other_kid, plain_studio, 'Other child' FROM ids;
INSERT INTO accounts (id, tenant_id, name, person_id) SELECT family, studio, 'Family', c1 FROM ids;
UPDATE people SET account_id = (SELECT family FROM ids) WHERE id IN (SELECT c1 FROM ids UNION SELECT c2 FROM ids UNION SELECT c3 FROM ids);

INSERT INTO seasons (id, tenant_id, name, start_date, end_date)
SELECT s_late, studio, 'Far season', current_date + 60, current_date + 300 FROM ids
UNION ALL SELECT s_soon, studio, 'Soon season', current_date + 10, current_date + 200 FROM ids;

INSERT INTO offerings (id, tenant_id, season_id, name, offering_type, price_minor, start_time, end_time)
SELECT o1, studio, s_late, 'Ballet', 'class', 20000, '16:00'::time, '17:00'::time FROM ids
UNION ALL SELECT o2, studio, s_late, 'Jazz', 'class', 30000, '17:00'::time, '18:00'::time FROM ids
UNION ALL SELECT o_soon, studio, s_soon, 'Tap', 'class', 10000, '18:00'::time, '19:00'::time FROM ids
UNION ALL SELECT o_plain, plain_studio, NULL, 'Plain class', 'class', 10000, '16:00'::time, '17:00'::time FROM ids;
INSERT INTO offerings (id, tenant_id, name, offering_type, duration_mins, price_minor)
SELECT appt, studio, 'Private lesson', 'appointment', 60, 20000 FROM ids;

-- Percent rules: sibling 10% / 15%, extra class 10%, early bird 5% until 30 days before; add up, max 30%.
INSERT INTO class_discount_settings (tenant_id, sibling_enabled, extra_class_enabled, early_bird_enabled)
SELECT studio, true, true, true FROM ids;

CREATE FUNCTION pg_temp.enrol(p_person uuid, p_offering uuid, p_minutes int, p_discount int DEFAULT 0)
RETURNS engagements LANGUAGE sql AS $$
  INSERT INTO engagements (tenant_id, person_id, offering_id, season_id, status, created_at, discount_minor)
  SELECT o.tenant_id, p_person, p_offering, o.season_id, 'pending_payment', now() + make_interval(mins => p_minutes), p_discount
  FROM offerings o WHERE o.id = p_offering
  RETURNING *;
$$;

CREATE FUNCTION pg_temp.expect(p_label text, p_e engagements, p_total int, p_kinds text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_kinds text;
BEGIN
  SELECT COALESCE(string_agg(l->>'kind' || ':' || (l->>'amount_minor'), ',' ORDER BY n), '')
  INTO v_kinds FROM jsonb_array_elements(p_e.discount_lines) WITH ORDINALITY t(l, n);
  IF p_e.discount_minor <> p_total OR v_kinds <> p_kinds THEN
    RAISE EXCEPTION 'FAIL %: got % [%], expected % [%]', p_label, p_e.discount_minor, v_kinds, p_total, p_kinds;
  END IF;
END;
$$;

DO $$
DECLARE
  v ids%ROWTYPE;
  e engagements%ROWTYPE;
  e2 engagements%ROWTYPE;
BEGIN
  SELECT * INTO v FROM ids;

  -- First child: early bird only (5% of 200.00). A discount sent by the caller is ignored.
  e := pg_temp.enrol(v.c1, v.o1, 1, 99999);
  PERFORM pg_temp.expect('first child', e, 1000, 'early_bird:1000');

  -- Second child: sibling 10% + early bird 5%.
  e2 := pg_temp.enrol(v.c2, v.o1, 2);
  PERFORM pg_temp.expect('second child', e2, 3000, 'sibling:2000,early_bird:1000');

  -- Third child: sibling 15% + early bird 5% of 300.00.
  e := pg_temp.enrol(v.c3, v.o2, 3);
  PERFORM pg_temp.expect('third child', e, 6000, 'sibling:4500,early_bird:1500');

  -- First child's second class: extra class + early bird, no sibling discount.
  e := pg_temp.enrol(v.c1, v.o2, 4);
  PERFORM pg_temp.expect('first child extra class', e, 4500, 'extra_class:3000,early_bird:1500');

  -- Cap: max 20% of 300.00 = 60.00; sibling 30.00 + extra 30.00 reach it, early bird is dropped.
  UPDATE class_discount_settings SET max_total_percent = 20 WHERE tenant_id = v.studio;
  e := pg_temp.enrol(v.c2, v.o2, 5);
  PERFORM pg_temp.expect('capped', e, 6000, 'sibling:3000,extra_class:3000');

  -- Nobody changes the discount by editing the enrolment.
  UPDATE engagements SET discount_minor = 0, discount_lines = '[]' WHERE id = e2.id;
  SELECT * INTO e FROM engagements WHERE id = e2.id;
  PERFORM pg_temp.expect('kept on update', e, 3000, 'sibling:2000,early_bird:1000');

  -- Biggest only: third child's second class: sibling 15% (30.00) beats extra 20.00 and early 10.00.
  UPDATE class_discount_settings SET combine_mode = 'biggest', max_total_percent = 30 WHERE tenant_id = v.studio;
  e := pg_temp.enrol(v.c3, v.o1, 6);
  PERFORM pg_temp.expect('biggest only', e, 3000, 'sibling:3000');

  -- Season starting in 10 days: too late for early bird; first in that season, so nothing.
  UPDATE class_discount_settings SET combine_mode = 'add_up' WHERE tenant_id = v.studio;
  e := pg_temp.enrol(v.c1, v.o_soon, 7);
  PERFORM pg_temp.expect('too late for early bird', e, 0, '');

  -- A fixed amount larger than the price is held to the cap.
  UPDATE class_discount_settings SET sibling_unit = 'amount', sibling_value = 50000, sibling_more_value = 50000,
    max_total_percent = 50 WHERE tenant_id = v.studio;
  e := pg_temp.enrol(v.c2, v.o_soon, 8);
  PERFORM pg_temp.expect('fixed amount capped', e, 5000, 'sibling:5000');

  -- Bookings are never discounted.
  e := pg_temp.enrol(v.c3, v.appt, 9);
  PERFORM pg_temp.expect('appointment', e, 0, '');

  -- A studio with no discount settings: nothing, and a discount sent by the caller is ignored.
  e := pg_temp.enrol(v.other_kid, v.o_plain, 1, 5000);
  PERFORM pg_temp.expect('no settings', e, 0, '');

  -- A cancelled sibling no longer counts for new enrolments (existing discounts stay).
  UPDATE engagements SET status = 'cancelled' WHERE person_id IN (v.c1, v.c2) AND offering_id = v.o_soon;
  UPDATE class_discount_settings SET early_bird_enabled = false WHERE tenant_id = v.studio;
  e := pg_temp.enrol(v.c3, v.o_soon, 10);
  PERFORM pg_temp.expect('cancelled sibling', e, 0, '');
END;
$$;

-- Percent rules over 90% are refused.
DO $$
BEGIN
  UPDATE class_discount_settings SET sibling_unit = 'percent', sibling_value = 95
  WHERE tenant_id = (SELECT studio FROM ids);
  RAISE EXCEPTION 'FAIL percent over 90 accepted';
EXCEPTION WHEN check_violation THEN NULL;
END;
$$;

-- Only the studio's own admins read and change its discount settings.
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cd-admin@example.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'cd-other@example.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'cd-parent@example.test');
INSERT INTO user_profiles (id, tenant_id, role, email)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, studio, ARRAY['tenant_admin'], 'cd-admin@example.test' FROM ids
UNION ALL SELECT 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, plain_studio, ARRAY['tenant_admin'], 'cd-other@example.test' FROM ids
UNION ALL SELECT 'aaaaaaaa-0000-0000-0000-000000000003'::uuid, studio, ARRAY['parent'], 'cd-parent@example.test' FROM ids
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, email = EXCLUDED.email;
GRANT SELECT ON ids TO authenticated;

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
  SELECT set_config('request.jwt.claim.sub', p_user::text, false);
$$;

SET ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  PERFORM pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000002');
  SELECT count(*) INTO n FROM class_discount_settings;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL other studio reads settings'; END IF;
  UPDATE class_discount_settings SET sibling_value = 50 WHERE true;
  PERFORM pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000003');
  SELECT count(*) INTO n FROM class_discount_settings;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL parent reads settings'; END IF;
  PERFORM pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
  UPDATE class_discount_settings SET sibling_value = 12;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL admin cannot update own settings'; END IF;
END;
$$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT sibling_value FROM class_discount_settings WHERE tenant_id = (SELECT studio FROM ids)) <> 12 THEN
    RAISE EXCEPTION 'FAIL settings changed by the wrong person';
  END IF;
END;
$$;

SELECT 'class discounts: all checks passed' AS result;
