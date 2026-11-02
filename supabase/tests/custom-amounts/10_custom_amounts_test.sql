CREATE TEMP TABLE ids AS SELECT
  gen_random_uuid() AS studio, gen_random_uuid() AS other_studio,
  gen_random_uuid() AS admin, gen_random_uuid() AS other_admin, gen_random_uuid() AS parent,
  gen_random_uuid() AS person, gen_random_uuid() AS offering, gen_random_uuid() AS eng,
  gen_random_uuid() AS billing, gen_random_uuid() AS schedule;
GRANT SELECT ON ids TO authenticated;

INSERT INTO tenants (id, name, subdomain, contact_email, payment_provider, invoicing_provider)
SELECT studio, 'Ballet', 'cam-' || substr(md5(random()::text), 1, 8), 'b@example.test', 'grow', 'grow' FROM ids
UNION ALL SELECT other_studio, 'Other', 'cam-o-' || substr(md5(random()::text), 1, 8), 'o@example.test', 'grow', 'grow' FROM ids;
INSERT INTO auth.users (id, email)
SELECT admin, 'cam-admin@example.test' FROM ids
UNION ALL SELECT other_admin, 'cam-other@example.test' FROM ids
UNION ALL SELECT parent, 'cam-parent@example.test' FROM ids;
INSERT INTO user_profiles (id, tenant_id, role, email)
SELECT admin, studio, ARRAY['tenant_admin'], 'cam-admin@example.test' FROM ids
UNION ALL SELECT other_admin, other_studio, ARRAY['tenant_admin'], 'cam-other@example.test' FROM ids
UNION ALL SELECT parent, studio, ARRAY['parent'], 'cam-parent@example.test' FROM ids
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, email = EXCLUDED.email;
INSERT INTO people (id, tenant_id, name) SELECT person, studio, 'Noa' FROM ids;
INSERT INTO offerings (id, tenant_id, name, offering_type, duration_mins) SELECT offering, studio, 'Ballet', 'appointment', 60 FROM ids;
INSERT INTO billing_accounts (id, tenant_id, person_id) SELECT billing, studio, person FROM ids;
INSERT INTO engagements (id, tenant_id, person_id, offering_id, status, billing_account_id)
SELECT eng, studio, person, offering, 'active', billing FROM ids;
INSERT INTO billing_schedules (id, tenant_id, engagement_id, billing_account_id, next_billing_date, status)
SELECT schedule, studio, eng, billing, '2026-12-01', 'active' FROM ids;

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
  v_err text;
  v_s billing_schedules%ROWTYPE;
BEGIN
  SELECT * INTO v FROM ids;

  -- Refused: a parent, another studio, no note, a non-positive amount, a month already due.
  PERFORM pg_temp.act_as(v.parent);
  v_err := pg_temp.error_of(format('SELECT set_billing_schedule_amount(%L, 30000, %L)', v.eng, 'Sibling'));
  IF v_err IS DISTINCT FROM 'Forbidden' THEN RAISE EXCEPTION 'FAIL parent: %', v_err; END IF;
  PERFORM pg_temp.act_as(v.other_admin);
  v_err := pg_temp.error_of(format('SELECT set_billing_schedule_amount(%L, 30000, %L)', v.eng, 'Sibling'));
  IF v_err IS DISTINCT FROM 'no_monthly_plan' THEN RAISE EXCEPTION 'FAIL other studio: %', v_err; END IF;
  PERFORM pg_temp.act_as(v.admin);
  v_err := pg_temp.error_of(format('SELECT set_billing_schedule_amount(%L, 30000, NULL)', v.eng));
  IF v_err IS DISTINCT FROM 'note_required' THEN RAISE EXCEPTION 'FAIL no note: %', v_err; END IF;
  v_err := pg_temp.error_of(format('SELECT set_billing_schedule_amount(%L, 0, %L)', v.eng, 'x'));
  IF v_err IS DISTINCT FROM 'amount_must_be_positive' THEN RAISE EXCEPTION 'FAIL zero: %', v_err; END IF;
  v_err := pg_temp.error_of(format('SELECT set_billing_month_amount(%L, %L, 10000, %L)', v.eng, '2026-11', 'Late'));
  IF v_err IS DISTINCT FROM 'period_already_due' THEN RAISE EXCEPTION 'FAIL past month: %', v_err; END IF;
  v_err := pg_temp.error_of(format('SELECT set_billing_month_amount(%L, %L, 10000, %L)', v.eng, '2026-13', 'Bad'));
  IF v_err IS DISTINCT FROM 'invalid_period' THEN RAISE EXCEPTION 'FAIL bad month: %', v_err; END IF;

  -- The student's own monthly amount, audited; back to the class price.
  PERFORM set_billing_schedule_amount(v.eng, 30000, '  Sibling discount agreed  ');
  SELECT * INTO v_s FROM billing_schedules WHERE id = v.schedule;
  IF v_s.amount_minor <> 30000 OR v_s.amount_note <> 'Sibling discount agreed' THEN
    RAISE EXCEPTION 'FAIL student amount not stored: % %', v_s.amount_minor, v_s.amount_note;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_log WHERE entity_id = v.schedule AND action = 'billing_schedule.amount_set'
                 AND actor_id = v.admin AND after_state->>'amount_minor' = '30000') THEN
    RAISE EXCEPTION 'FAIL no audit row for the student amount';
  END IF;
  PERFORM set_billing_schedule_amount(v.eng, NULL);
  SELECT * INTO v_s FROM billing_schedules WHERE id = v.schedule;
  IF v_s.amount_minor IS NOT NULL OR v_s.amount_note IS NOT NULL THEN RAISE EXCEPTION 'FAIL reset to class price'; END IF;

  -- A one-off amount for a coming month: set, change, remove; audited each time.
  PERFORM set_billing_month_amount(v.eng, '2027-01', 17500, 'Half month, holiday');
  PERFORM set_billing_month_amount(v.eng, '2027-01', 20000, 'Half month plus a workshop');
  IF (SELECT amount_minor FROM billing_month_adjustments WHERE billing_schedule_id = v.schedule AND period = '2027-01') <> 20000 THEN
    RAISE EXCEPTION 'FAIL one-off amount not updated';
  END IF;
  PERFORM set_billing_month_amount(v.eng, '2026-12', 10000, 'December: two lessons only');
  PERFORM set_billing_month_amount(v.eng, '2027-01', NULL);
  IF EXISTS (SELECT 1 FROM billing_month_adjustments WHERE billing_schedule_id = v.schedule AND period = '2027-01') THEN
    RAISE EXCEPTION 'FAIL one-off amount not removed';
  END IF;
  IF (SELECT count(*) FROM audit_log WHERE entity_id = v.schedule AND action = 'billing_month.amount_set') <> 4 THEN
    RAISE EXCEPTION 'FAIL expected 4 audit rows for one-off amounts';
  END IF;

  -- Admins read the one-off amounts (RLS), other studios do not.
  PERFORM pg_temp.act_as(v.admin);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM billing_month_adjustments) <> 1 THEN RAISE EXCEPTION 'FAIL admin cannot read'; END IF;
  RESET ROLE;
  PERFORM pg_temp.act_as(v.other_admin);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM billing_month_adjustments) <> 0 THEN RAISE EXCEPTION 'FAIL other studio can read'; END IF;
  RESET ROLE;

  -- A cancelled plan takes no amounts.
  UPDATE billing_schedules SET status = 'cancelled' WHERE id = v.schedule;
  PERFORM pg_temp.act_as(v.admin);
  v_err := pg_temp.error_of(format('SELECT set_billing_month_amount(%L, %L, 10000, %L)', v.eng, '2027-02', 'x'));
  IF v_err IS DISTINCT FROM 'no_monthly_plan' THEN RAISE EXCEPTION 'FAIL cancelled plan: %', v_err; END IF;

  RAISE NOTICE 'custom amounts: all checks passed';
END;
$$;
SELECT 'custom amounts: all checks passed' AS result;
