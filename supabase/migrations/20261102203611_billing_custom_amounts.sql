-- =============================================================================
-- Per-student and per-month amounts for monthly plans (payments follow-up 5,
-- owner decision). No automatic pro-rating, discount codes or class-wide
-- changes; the shapes leave room for discount rules later (a new `kind`).
--
-- Each month's amount is, in order:
--   1. a one-off amount for that month (billing_month_adjustments), else
--   2. the student's own monthly amount (billing_schedules.amount_minor), else
--   3. the class price (offerings.price_minor), as before.
-- The edge resolver (_shared/payments/month-amount.ts) applies this to monthly
-- charges, recorded monthly fees and the card link.
--
-- Changes go through two SECURITY DEFINER functions (tenant admin of the
-- studio only), which write audit rows. Admins can read both tables.
-- =============================================================================

ALTER TABLE billing_schedules
  ADD COLUMN IF NOT EXISTS amount_minor INT CHECK (amount_minor IS NULL OR amount_minor > 0),
  ADD COLUMN IF NOT EXISTS amount_note  TEXT;

COMMENT ON COLUMN billing_schedules.amount_minor IS
  'This student''s monthly amount (gross, minor units); NULL = the class price.';
COMMENT ON COLUMN billing_schedules.amount_note IS
  'Why this student pays a different monthly amount (shown to admins).';

CREATE TABLE IF NOT EXISTS billing_month_adjustments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id),
  billing_schedule_id UUID        NOT NULL REFERENCES billing_schedules(id) ON DELETE CASCADE,
  period              TEXT        NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- 'one_off': a set amount for one month. Discount rules can add kinds later.
  kind                TEXT        NOT NULL DEFAULT 'one_off' CHECK (kind IN ('one_off')),
  amount_minor        INT         NOT NULL CHECK (amount_minor > 0),
  note                TEXT        NOT NULL CHECK (length(trim(note)) > 0),
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (billing_schedule_id, period, kind)
);

COMMENT ON TABLE billing_month_adjustments IS
  'A different amount for one month of a monthly plan, with the reason (payments follow-up 5).';

CREATE INDEX IF NOT EXISTS idx_billing_month_adjustments_tenant ON billing_month_adjustments(tenant_id);

ALTER TABLE billing_month_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_month_adjustments_super_admin ON billing_month_adjustments FOR ALL
  USING (is_super_admin());
CREATE POLICY billing_month_adjustments_admin_read ON billing_month_adjustments FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
REVOKE ALL ON billing_month_adjustments FROM anon;
GRANT SELECT ON billing_month_adjustments TO authenticated;

-- The open monthly plan of an enrolment in the caller's studio, for the admin functions.
-- Raises when the caller is not a tenant admin or there is no open plan.
CREATE OR REPLACE FUNCTION private.admin_open_billing_schedule(p_engagement_id UUID)
RETURNS public.billing_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_schedule  billing_schedules%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND tenant_id = v_tenant_id
      AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_schedule
  FROM billing_schedules
  WHERE engagement_id = p_engagement_id AND tenant_id = v_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_schedule.status = 'cancelled' THEN
    RAISE EXCEPTION 'no_monthly_plan';
  END IF;
  RETURN v_schedule;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.admin_open_billing_schedule(UUID) FROM PUBLIC, anon, authenticated;

-- This student's monthly amount. NULL amount = back to the class price.
CREATE OR REPLACE FUNCTION public.set_billing_schedule_amount(
  p_engagement_id UUID,
  p_amount_minor  INT,
  p_note          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before billing_schedules%ROWTYPE;
  v_after  billing_schedules%ROWTYPE;
  v_note   TEXT := NULLIF(trim(p_note), '');
BEGIN
  v_before := private.admin_open_billing_schedule(p_engagement_id);
  IF p_amount_minor IS NOT NULL AND p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive';
  END IF;
  IF p_amount_minor IS NOT NULL AND v_note IS NULL THEN
    RAISE EXCEPTION 'note_required';
  END IF;

  UPDATE billing_schedules
  SET amount_minor = p_amount_minor,
      amount_note  = CASE WHEN p_amount_minor IS NULL THEN NULL ELSE v_note END,
      updated_at   = now()
  WHERE id = v_before.id
  RETURNING * INTO v_after;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (
    v_before.tenant_id, auth.uid(), 'billing_schedule.amount_set', 'billing_schedule', v_before.id,
    jsonb_build_object('amount_minor', v_before.amount_minor, 'amount_note', v_before.amount_note),
    jsonb_build_object('amount_minor', v_after.amount_minor, 'amount_note', v_after.amount_note,
                       'engagement_id', p_engagement_id)
  );

  RETURN jsonb_build_object('billing_schedule_id', v_after.id, 'amount_minor', v_after.amount_minor,
                            'amount_note', v_after.amount_note);
END;
$$;

-- A one-off amount for one coming month (from the month that is due onwards).
-- NULL amount removes it.
CREATE OR REPLACE FUNCTION public.set_billing_month_amount(
  p_engagement_id UUID,
  p_period        TEXT,
  p_amount_minor  INT,
  p_note          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule billing_schedules%ROWTYPE;
  v_before   billing_month_adjustments%ROWTYPE;
  v_note     TEXT := NULLIF(trim(p_note), '');
BEGIN
  v_schedule := private.admin_open_billing_schedule(p_engagement_id);
  IF p_period IS NULL OR p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'invalid_period';
  END IF;
  IF p_period < to_char(v_schedule.next_billing_date, 'YYYY-MM') THEN
    RAISE EXCEPTION 'period_already_due';
  END IF;

  SELECT * INTO v_before FROM billing_month_adjustments
  WHERE billing_schedule_id = v_schedule.id AND period = p_period AND kind = 'one_off';

  IF p_amount_minor IS NULL THEN
    DELETE FROM billing_month_adjustments WHERE id = v_before.id;
  ELSE
    IF p_amount_minor <= 0 THEN
      RAISE EXCEPTION 'amount_must_be_positive';
    END IF;
    IF v_note IS NULL THEN
      RAISE EXCEPTION 'note_required';
    END IF;
    INSERT INTO billing_month_adjustments (tenant_id, billing_schedule_id, period, kind, amount_minor, note, created_by)
    VALUES (v_schedule.tenant_id, v_schedule.id, p_period, 'one_off', p_amount_minor, v_note, auth.uid())
    ON CONFLICT (billing_schedule_id, period, kind)
    DO UPDATE SET amount_minor = EXCLUDED.amount_minor, note = EXCLUDED.note,
                  created_by = EXCLUDED.created_by, updated_at = now();
  END IF;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (
    v_schedule.tenant_id, auth.uid(), 'billing_month.amount_set', 'billing_schedule', v_schedule.id,
    CASE WHEN v_before.id IS NULL THEN NULL
         ELSE jsonb_build_object('period', p_period, 'amount_minor', v_before.amount_minor, 'note', v_before.note) END,
    jsonb_build_object('period', p_period, 'amount_minor', p_amount_minor,
                       'note', CASE WHEN p_amount_minor IS NULL THEN NULL ELSE v_note END,
                       'engagement_id', p_engagement_id)
  );

  RETURN jsonb_build_object('billing_schedule_id', v_schedule.id, 'period', p_period,
                            'amount_minor', p_amount_minor);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_billing_schedule_amount(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_billing_schedule_amount(UUID, INT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_billing_month_amount(UUID, TEXT, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_billing_month_amount(UUID, TEXT, INT, TEXT) TO authenticated;
