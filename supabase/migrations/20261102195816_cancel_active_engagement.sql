-- =============================================================================
-- Cancel an ACTIVE (paid) enrolment and stop its monthly plan (payments
-- follow-up 3). cancel_engagement only handles places that were never paid;
-- an active enrolment kept its billing schedule, so a monthly plan could not
-- be stopped from the app.
--
-- cancel_active_engagement: tenant admin only, same tenant; the enrolment
-- becomes 'cancelled' and its billing schedule 'cancelled' (the monthly run
-- only picks 'active' schedules, so no further charges or dunning). Payments
-- already made stay as they are (refunds are separate). Audited.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_active_engagement(
  p_engagement_id UUID,
  p_reason        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id   UUID;
  v_row         engagements%ROWTYPE;
  v_reason      TEXT;
  v_schedule_id UUID;
  v_schedule_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND tenant_id = v_tenant_id
      AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_reason := NULLIF(trim(p_reason), '');

  SELECT * INTO v_row
  FROM engagements
  WHERE id = p_engagement_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  IF v_row.status = 'cancelled' THEN
    RETURN to_jsonb(v_row);
  END IF;
  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'Engagement cannot be cancelled from status %', v_row.status;
  END IF;

  UPDATE engagements
  SET
    status              = 'cancelled',
    cancelled_at        = COALESCE(cancelled_at, now()),
    cancellation_reason = COALESCE(v_reason, cancellation_reason),
    cancelled_by        = COALESCE(cancelled_by, auth.uid()),
    updated_at          = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  SELECT id, status INTO v_schedule_id, v_schedule_status
  FROM billing_schedules
  WHERE engagement_id = v_row.id AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF v_schedule_id IS NOT NULL AND v_schedule_status <> 'cancelled' THEN
    UPDATE billing_schedules
    SET status = 'cancelled', next_attempt_at = NULL, updated_at = now()
    WHERE id = v_schedule_id;
  END IF;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (
    v_tenant_id,
    auth.uid(),
    'UPDATE',
    'engagements',
    v_row.id,
    jsonb_build_object('status', 'active', 'billing_schedule_status', v_schedule_status),
    jsonb_build_object(
      'status', 'cancelled',
      'cancellation_reason', v_reason,
      'transition', 'cancel_active',
      'billing_schedule_id', v_schedule_id,
      'billing_schedule_status', CASE WHEN v_schedule_id IS NULL THEN NULL ELSE 'cancelled' END
    )
  );

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_active_engagement(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_active_engagement(UUID, TEXT) TO authenticated;
