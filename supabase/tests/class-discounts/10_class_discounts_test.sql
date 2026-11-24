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

-- Siblings by shared parent email, a discount for one client, and coupon codes.
CREATE TEMP TABLE mids AS SELECT
  gen_random_uuid() AS studio, gen_random_uuid() AS season, gen_random_uuid() AS o1,
  gen_random_uuid() AS p1, gen_random_uuid() AS p2, gen_random_uuid() AS fam1, gen_random_uuid() AS fam2,
  gen_random_uuid() AS a, gen_random_uuid() AS b, gen_random_uuid() AS c, gen_random_uuid() AS d,
  gen_random_uuid() AS welcome, gen_random_uuid() AS monthly;

INSERT INTO tenants (id, name, subdomain, contact_email, payment_provider, invoicing_provider)
SELECT studio, 'Mail', 'cd-m-' || substr(md5(random()::text), 1, 8), 'm@example.test', 'grow', 'grow' FROM mids;
INSERT INTO seasons (id, tenant_id, name, start_date, end_date)
SELECT season, studio, 'Season', current_date + 5, current_date + 200 FROM mids;
INSERT INTO offerings (id, tenant_id, season_id, name, offering_type, price_minor, start_time, end_time)
SELECT o1, studio, season, 'Ballet', 'class', 20000, '16:00'::time, '17:00'::time FROM mids;
-- Two separate family records whose parents share one email (in different case).
INSERT INTO people (id, tenant_id, name, email) SELECT p1, studio, 'Parent one', 'Parent@Example.test' FROM mids
UNION ALL SELECT p2, studio, 'Parent two', ' parent@example.test' FROM mids
UNION ALL SELECT a, studio, 'Kid A', NULL FROM mids
UNION ALL SELECT b, studio, 'Kid B', NULL FROM mids
UNION ALL SELECT c, studio, 'Kid C', 'c@example.test' FROM mids
UNION ALL SELECT d, studio, 'Kid D', NULL FROM mids;
INSERT INTO accounts (id, tenant_id, name, person_id) SELECT fam1, studio, 'One', p1 FROM mids
UNION ALL SELECT fam2, studio, 'Two', p2 FROM mids;
UPDATE people SET account_id = (SELECT fam1 FROM mids) WHERE id IN (SELECT a FROM mids UNION SELECT p1 FROM mids);
UPDATE people SET account_id = (SELECT fam2 FROM mids) WHERE id IN (SELECT b FROM mids UNION SELECT p2 FROM mids);

INSERT INTO class_discount_settings (tenant_id, sibling_enabled) SELECT studio, true FROM mids;
INSERT INTO class_discount_clients (tenant_id, email, unit, value) SELECT studio, 'c@example.test', 'amount', 5000 FROM mids;
INSERT INTO class_discount_coupons (id, tenant_id, code, unit, value, applies_to) SELECT welcome, studio, 'WELCOME', 'percent', 10, 'first_payment' FROM mids;
INSERT INTO class_discount_coupons (id, tenant_id, code, unit, value, applies_to, max_uses)
SELECT monthly, studio, 'MONTHLY', 'amount', 2000, 'every_month', 1 FROM mids;
INSERT INTO class_discount_coupons (tenant_id, code, unit, value, valid_until) SELECT studio, 'OLD', 'percent', 10, current_date - 1 FROM mids;
INSERT INTO class_discount_coupons (tenant_id, code, unit, value, active) SELECT studio, 'OFF', 'percent', 10, false FROM mids;

CREATE FUNCTION pg_temp.expect_first(p_label text, p_id uuid, p_first int, p_coupon uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE e engagements%ROWTYPE;
BEGIN
  SELECT * INTO e FROM engagements WHERE id = p_id;
  IF e.first_discount_minor <> p_first OR e.coupon_id IS DISTINCT FROM p_coupon THEN
    RAISE EXCEPTION 'FAIL %: first % coupon %, expected % %', p_label, e.first_discount_minor, e.coupon_id, p_first, p_coupon;
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.expect_reason(p_label text, p_result jsonb, p_reason text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(p_result->>'reason', 'ok') <> p_reason THEN
    RAISE EXCEPTION 'FAIL %: got %, expected %', p_label, p_result, p_reason;
  END IF;
END;
$$;

DO $$
DECLARE
  v mids%ROWTYPE;
  ea engagements%ROWTYPE;
  eb engagements%ROWTYPE;
  ec engagements%ROWTYPE;
  ed engagements%ROWTYPE;
  e engagements%ROWTYPE;
BEGIN
  SELECT * INTO v FROM mids;

  ea := pg_temp.enrol(v.a, v.o1, 1);
  PERFORM pg_temp.expect('email: first child', ea, 0, '');
  -- Different family record, same parent email: a sibling.
  eb := pg_temp.enrol(v.b, v.o1, 2);
  PERFORM pg_temp.expect('email: sibling by shared email', eb, 2000, 'sibling:2000');
  -- Own email, no shared family: not a sibling, but the studio gave this client 50.00 off.
  ec := pg_temp.enrol(v.c, v.o1, 3);
  PERFORM pg_temp.expect('client discount', ec, 5000, 'client:5000');

  -- First-payment coupon on top, held to the 30% maximum (60.00, 50.00 already used).
  PERFORM pg_temp.expect_reason('welcome on c', public.apply_class_coupon(ec.id, ' welcome '), 'ok');
  SELECT * INTO e FROM engagements WHERE id = ec.id;
  PERFORM pg_temp.expect('first-payment coupon keeps monthly discount', e, 5000, 'client:5000,coupon:1000');
  PERFORM pg_temp.expect_first('first-payment coupon', ec.id, 1000, v.welcome);

  -- Every-month coupon: part of the monthly discount.
  PERFORM pg_temp.expect_reason('monthly on b', public.apply_class_coupon(eb.id, 'MONTHLY'), 'ok');
  SELECT * INTO e FROM engagements WHERE id = eb.id;
  PERFORM pg_temp.expect('every-month coupon', e, 4000, 'sibling:2000,coupon:2000');
  PERFORM pg_temp.expect_first('every-month coupon', eb.id, 0, v.monthly);

  -- Used once already, expired, switched off, unknown.
  ed := pg_temp.enrol(v.d, v.o1, 4);
  PERFORM pg_temp.expect_reason('used up', public.apply_class_coupon(ed.id, 'MONTHLY'), 'used_up');
  PERFORM pg_temp.expect_reason('expired', public.apply_class_coupon(ed.id, 'OLD'), 'expired');
  PERFORM pg_temp.expect_reason('switched off', public.apply_class_coupon(ed.id, 'OFF'), 'not_found');
  PERFORM pg_temp.expect_reason('unknown', public.apply_class_coupon(ed.id, 'NOPE'), 'not_found');
  PERFORM pg_temp.expect_reason('empty', public.apply_class_coupon(ed.id, '  '), 'not_found');
  PERFORM pg_temp.expect_first('bad codes change nothing', ed.id, 0, NULL);

  -- A new code replaces the old one, which frees its use.
  PERFORM pg_temp.expect_reason('welcome replaces monthly', public.apply_class_coupon(eb.id, 'WELCOME'), 'ok');
  SELECT * INTO e FROM engagements WHERE id = eb.id;
  PERFORM pg_temp.expect('replaced coupon', e, 2000, 'sibling:2000,coupon:2000');
  PERFORM pg_temp.expect_first('replaced coupon', eb.id, 2000, v.welcome);
  PERFORM pg_temp.expect_reason('monthly free again', public.apply_class_coupon(ed.id, 'MONTHLY'), 'ok');

  -- Nobody changes the coupon by editing the enrolment.
  UPDATE engagements SET first_discount_minor = 0, coupon_id = NULL, discount_minor = 0 WHERE id = eb.id;
  SELECT * INTO e FROM engagements WHERE id = eb.id;
  PERFORM pg_temp.expect('coupon kept on update', e, 2000, 'sibling:2000,coupon:2000');
  PERFORM pg_temp.expect_first('coupon kept on update', eb.id, 2000, v.welcome);

  -- Only enrolments still waiting for payment take a coupon.
  UPDATE engagements SET status = 'active' WHERE id = ea.id;
  PERFORM pg_temp.expect_reason('paid already', public.apply_class_coupon(ea.id, 'WELCOME'), 'not_payable');

  -- A coupon sent with a new enrolment is ignored.
  UPDATE engagements SET status = 'cancelled' WHERE id = ed.id;
  INSERT INTO engagements (tenant_id, person_id, offering_id, season_id, status, coupon_id, first_discount_minor)
  VALUES (v.studio, v.d, v.o1, v.season, 'pending_payment', v.welcome, 9999) RETURNING * INTO e;
  PERFORM pg_temp.expect_first('caller coupon ignored', e.id, 0, NULL);
END;
$$;

-- A coupon comes off every payment unless set as a one-month discount.
DO $$
BEGIN
  INSERT INTO class_discount_coupons (tenant_id, code, value) SELECT studio, 'PLAIN', 5 FROM mids;
  IF (SELECT applies_to FROM class_discount_coupons WHERE code = 'PLAIN') <> 'every_month' THEN
    RAISE EXCEPTION 'FAIL coupon default is not every payment';
  END IF;
END;
$$;

-- Every kind of sale: a booking gets the client's own discount; shoot payment
-- requests get it too, and a coupon typed on the pay page.
CREATE TEMP TABLE sids AS SELECT
  gen_random_uuid() AS appt, gen_random_uuid() AS shoot, gen_random_uuid() AS shoot2,
  gen_random_uuid() AS pct, gen_random_uuid() AS fixed;
INSERT INTO offerings (id, tenant_id, name, offering_type, duration_mins, price_minor)
SELECT s.appt, m.studio, 'Shoot', 'appointment', 60, 50000 FROM sids s, mids m;
INSERT INTO class_discount_coupons (id, tenant_id, code, unit, value)
SELECT pct, (SELECT studio FROM mids), 'SHOOT10', 'percent', 10 FROM sids
UNION ALL SELECT fixed, (SELECT studio FROM mids), 'FIFTY', 'amount', 5000 FROM sids;

DO $$
DECLARE
  v mids%ROWTYPE;
  w sids%ROWTYPE;
  e engagements%ROWTYPE;
  r1 job_payment_requests%ROWTYPE;
  r2 job_payment_requests%ROWTYPE;
  r3 job_payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v FROM mids;
  SELECT * INTO w FROM sids;

  -- A booking for a client with a discount (Kid C's email: 50.00 off).
  e := pg_temp.enrol(v.c, w.appt, 10);
  PERFORM pg_temp.expect('booking: client discount', e, 5000, 'client:5000');
  PERFORM pg_temp.expect_reason('coupon on a booking', public.apply_class_coupon(e.id, 'SHOOT10'), 'ok');
  SELECT * INTO e FROM engagements WHERE id = e.id;
  PERFORM pg_temp.expect('booking: coupon every payment', e, 10000, 'client:5000,coupon:5000');

  -- A shoot paid by requests (deposit and balance): a fixed client discount comes off once.
  INSERT INTO class_discount_clients (tenant_id, email, unit, value) VALUES (v.studio, 'parent@example.test', 'amount', 5000);
  INSERT INTO engagements (id, tenant_id, person_id, offering_id, status)
  VALUES (w.shoot, v.studio, v.p2, w.appt, 'active');
  INSERT INTO job_payment_requests (tenant_id, engagement_id, label, amount_minor)
  VALUES (v.studio, w.shoot, 'Deposit', 20000) RETURNING * INTO r1;
  INSERT INTO job_payment_requests (tenant_id, engagement_id, label, amount_minor)
  VALUES (v.studio, w.shoot, 'Balance', 35000) RETURNING * INTO r2;
  IF r1.amount_minor <> 15000 OR r1.list_amount_minor <> 20000 OR r2.amount_minor <> 35000 OR r2.discount_minor <> 0 THEN
    RAISE EXCEPTION 'FAIL fixed client discount once per shoot: % / %', r1.amount_minor, r2.amount_minor;
  END IF;

  -- A percentage coupon on the pay page comes off every unpaid payment of the shoot
  -- (the deposit already has 50.00 off, so the 30% maximum leaves 10.00 for the coupon).
  PERFORM pg_temp.expect_reason('coupon on the pay page', public.apply_request_coupon(r2.public_token, 'shoot10'), 'ok');
  SELECT * INTO r1 FROM job_payment_requests WHERE id = r1.id;
  SELECT * INTO r2 FROM job_payment_requests WHERE id = r2.id;
  IF r2.amount_minor <> 31500 OR r1.amount_minor <> 14000 OR r1.coupon_id <> w.pct THEN
    RAISE EXCEPTION 'FAIL percent coupon on every payment: deposit %, balance %', r1.amount_minor, r2.amount_minor;
  END IF;
  -- ...and on a payment added later.
  INSERT INTO job_payment_requests (tenant_id, engagement_id, label, amount_minor)
  VALUES (v.studio, w.shoot, 'Extra prints', 10000) RETURNING * INTO r3;
  IF r3.amount_minor <> 9000 THEN
    RAISE EXCEPTION 'FAIL coupon carries to a later payment: %', r3.amount_minor;
  END IF;

  -- Editing an unpaid request's amount by hand: the studio's amount wins.
  UPDATE job_payment_requests SET amount_minor = 12000 WHERE id = r3.id;
  SELECT * INTO r3 FROM job_payment_requests WHERE id = r3.id;
  IF r3.amount_minor <> 12000 OR r3.discount_minor <> 0 OR r3.list_amount_minor IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL hand-edited amount keeps a stale discount';
  END IF;
  -- Nobody changes the discount fields by hand.
  UPDATE job_payment_requests SET discount_minor = 0, discount_lines = '[]' WHERE id = r2.id;
  SELECT * INTO r2 FROM job_payment_requests WHERE id = r2.id;
  IF r2.discount_minor <> 3500 THEN RAISE EXCEPTION 'FAIL request discount changed by hand'; END IF;

  PERFORM pg_temp.expect_reason('pay page: unknown code', public.apply_request_coupon(r2.public_token, 'NOPE'), 'not_found');
  PERFORM pg_temp.expect_reason('pay page: unknown token', public.apply_request_coupon('nope', 'SHOOT10'), 'not_payable');

  -- Discounts switched off for the studio: nothing applies.
  INSERT INTO tenant_feature_overrides (tenant_id, feature_key, is_enabled, set_by)
  VALUES (v.studio, 'billing:discounts', false, 'operator');
  INSERT INTO engagements (id, tenant_id, person_id, offering_id, status)
  VALUES (w.shoot2, v.studio, v.p1, w.appt, 'active');
  INSERT INTO job_payment_requests (tenant_id, engagement_id, label, amount_minor)
  VALUES (v.studio, w.shoot2, 'Deposit', 15000) RETURNING * INTO r1;
  IF r1.amount_minor <> 15000 OR r1.discount_minor <> 0 THEN RAISE EXCEPTION 'FAIL discounts off still discount'; END IF;
  PERFORM pg_temp.expect_reason('switched off: coupon', public.apply_request_coupon(r1.public_token, 'SHOOT10'), 'not_found');
  e := pg_temp.enrol(v.p1, v.o1, 11);
  PERFORM pg_temp.expect('switched off: enrolment', e, 0, '');
  DELETE FROM tenant_feature_overrides WHERE tenant_id = v.studio AND feature_key = 'billing:discounts';
END;
$$;

-- A client email must be lower case; a coupon code upper case.
DO $$
BEGIN
  INSERT INTO class_discount_clients (tenant_id, email, value) SELECT studio, 'Mixed@Example.test', 10 FROM mids;
  RAISE EXCEPTION 'FAIL mixed-case email accepted';
EXCEPTION WHEN check_violation THEN NULL;
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
GRANT SELECT ON mids TO authenticated;

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
  SELECT count(*) INTO n FROM class_discount_coupons;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL parent reads coupons'; END IF;
  SELECT count(*) INTO n FROM class_discount_clients;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL parent reads client discounts'; END IF;
  PERFORM pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
  UPDATE class_discount_settings SET sibling_value = 12;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL admin cannot update own settings'; END IF;
  INSERT INTO class_discount_coupons (tenant_id, code, value) SELECT studio, 'ADMIN', 5 FROM ids;
  SELECT count(*) INTO n FROM class_discount_coupons;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL admin sees % coupons', n; END IF;
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
