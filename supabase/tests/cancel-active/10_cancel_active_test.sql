CREATE TEMP TABLE ids AS SELECT
  gen_random_uuid() AS studio, gen_random_uuid() AS other_studio,
  gen_random_uuid() AS admin, gen_random_uuid() AS other_admin, gen_random_uuid() AS parent,
  gen_random_uuid() AS person, gen_random_uuid() AS offering, gen_random_uuid() AS offering2, gen_random_uuid() AS offering3,
  gen_random_uuid() AS active_eng, gen_random_uuid() AS pending_eng, gen_random_uuid() AS no_plan_eng,
  gen_random_uuid() AS billing, gen_random_uuid() AS schedule;
GRANT SELECT ON ids TO authenticated;

INSERT INTO tenants (id, name, subdomain, contact_email, payment_provider, invoicing_provider)
SELECT studio, 'Ballet studio', 'ca-' || substr(md5(random()::text), 1, 8), 'b@example.test', 'grow', 'grow' FROM ids
UNION ALL
SELECT other_studio, 'Other studio', 'ca-o-' || substr(md5(random()::text), 1, 8), 'o@example.test', 'grow', 'grow' FROM ids;

INSERT INTO auth.users (id, email)
SELECT admin, 'ca-admin@example.test' FROM ids
UNION ALL SELECT other_admin, 'ca-other@example.test' FROM ids
UNION ALL SELECT parent, 'ca-parent@example.test' FROM ids;

INSERT INTO user_profiles (id, tenant_id, role, email)
SELECT admin, studio, ARRAY['tenant_admin'], 'ca-admin@example.test' FROM ids
UNION ALL SELECT other_admin, other_studio, ARRAY['tenant_admin'], 'ca-other@example.test' FROM ids
UNION ALL SELECT parent, studio, ARRAY['parent'], 'ca-parent@example.test' FROM ids
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, email = EXCLUDED.email;

INSERT INTO people (id, tenant_id, name) SELECT person, studio, 'Noa' FROM ids;
INSERT INTO offerings (id, tenant_id, name, offering_type, duration_mins)
SELECT offering, studio, 'Ballet', 'appointment', 60 FROM ids
UNION ALL SELECT offering2, studio, 'Jazz', 'appointment', 60 FROM ids
UNION ALL SELECT offering3, studio, 'Tap', 'appointment', 60 FROM ids;
INSERT INTO billing_accounts (id, tenant_id, person_id) SELECT billing, studio, person FROM ids;
INSERT INTO engagements (id, tenant_id, person_id, offering_id, status, billing_account_id)
SELECT active_eng, studio, person, offering, 'active', billing FROM ids
UNION ALL SELECT pending_eng, studio, person, offering2, 'pending_payment', billing FROM ids
UNION ALL SELECT no_plan_eng, studio, person, offering3, 'active', billing FROM ids;
INSERT INTO billing_schedules (id, tenant_id, engagement_id, billing_account_id, next_billing_date, status, next_attempt_at)
SELECT schedule, studio, active_eng, billing, '2026-12-01', 'active', now() FROM ids;

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
  SELECT set_config('request.jwt.claim.sub', p_user::text, false);
$$;

-- Runs p_sql and returns the error message, or NULL when it succeeded.
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
  v_eng engagements%ROWTYPE;
  v_sched billing_schedules%ROWTYPE;
BEGIN
  SELECT * INTO v FROM ids;

  -- 1. Refused: a parent, another studio's admin, a place that is not active.
  PERFORM pg_temp.act_as(v.parent);
  v_err := pg_temp.error_of(format('SELECT cancel_active_engagement(%L)', v.active_eng));
  IF v_err IS DISTINCT FROM 'Forbidden' THEN RAISE EXCEPTION 'FAIL parent: %', v_err; END IF;

  PERFORM pg_temp.act_as(v.other_admin);
  v_err := pg_temp.error_of(format('SELECT cancel_active_engagement(%L)', v.active_eng));
  IF v_err IS DISTINCT FROM 'Engagement not found' THEN RAISE EXCEPTION 'FAIL other studio: %', v_err; END IF;

  PERFORM pg_temp.act_as(v.admin);
  v_err := pg_temp.error_of(format('SELECT cancel_active_engagement(%L)', v.pending_eng));
  IF v_err NOT LIKE 'Engagement cannot be cancelled from status pending_payment' THEN
    RAISE EXCEPTION 'FAIL pending place: %', v_err;
  END IF;

  -- 2. The admin cancels the active place: it and its monthly plan stop, audited.
  PERFORM cancel_active_engagement(v.active_eng, '  Moving abroad  ');
  SELECT * INTO v_eng FROM engagements WHERE id = v.active_eng;
  SELECT * INTO v_sched FROM billing_schedules WHERE id = v.schedule;
  IF v_eng.status <> 'cancelled' OR v_eng.cancellation_reason <> 'Moving abroad'
     OR v_eng.cancelled_by <> v.admin OR v_eng.cancelled_at IS NULL THEN
    RAISE EXCEPTION 'FAIL engagement not cancelled properly: % %', v_eng.status, v_eng.cancellation_reason;
  END IF;
  IF v_sched.status <> 'cancelled' OR v_sched.next_attempt_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL billing schedule still running: %', v_sched.status;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM audit_log
    WHERE entity_id = v.active_eng AND actor_id = v.admin
      AND after_state->>'transition' = 'cancel_active'
      AND after_state->>'billing_schedule_id' = v.schedule::text
      AND before_state->>'billing_schedule_status' = 'active'
  ) THEN
    RAISE EXCEPTION 'FAIL no audit row for the cancellation';
  END IF;

  -- 3. Again: a no-op. An active place with no monthly plan cancels too.
  PERFORM cancel_active_engagement(v.active_eng);
  IF (SELECT count(*) FROM audit_log WHERE entity_id = v.active_eng AND after_state->>'transition' = 'cancel_active') <> 1 THEN
    RAISE EXCEPTION 'FAIL a second cancel wrote another audit row';
  END IF;
  PERFORM cancel_active_engagement(v.no_plan_eng);
  IF (SELECT status FROM engagements WHERE id = v.no_plan_eng) <> 'cancelled' THEN
    RAISE EXCEPTION 'FAIL active place without a plan was not cancelled';
  END IF;

  RAISE NOTICE 'cancel active: all checks passed';
END;
$$;
SELECT 'cancel active: all checks passed' AS result;
