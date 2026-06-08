-- Phase 1: admin cancel pre-payment engagements
-- Columns: engagements (011)

CREATE OR REPLACE FUNCTION public.cancel_engagement(
  p_engagement_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_row engagements%ROWTYPE;
  v_old_status TEXT;
  v_reason TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
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

  v_old_status := v_row.status;

  IF v_row.status = 'cancelled' THEN
    RETURN to_jsonb(v_row);
  END IF;

  IF v_row.status NOT IN ('pending_payment', 'admin_review', 'pending_offer') THEN
    RAISE EXCEPTION 'Engagement cannot be cancelled from status %', v_row.status;
  END IF;

  IF v_row.payment_received_at IS NOT NULL THEN
    RAISE EXCEPTION 'Engagement already has payment recorded';
  END IF;

  IF EXISTS (
    SELECT 1 FROM payments p
    WHERE p.engagement_id = v_row.id
      AND p.tenant_id = v_tenant_id
      AND p.status = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'Engagement has a succeeded payment';
  END IF;

  UPDATE engagements
  SET
    status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, now()),
    cancellation_reason = COALESCE(v_reason, cancellation_reason),
    cancelled_by = COALESCE(cancelled_by, auth.uid()),
    updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (
    v_tenant_id,
    auth.uid(),
    'UPDATE',
    'engagements',
    v_row.id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object(
      'status', 'cancelled',
      'cancellation_reason', v_reason,
      'transition', 'cancel_pre_payment'
    )
  );

  -- TODO: process-waiting-list Edge Function (V2.2)

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_engagement(UUID, TEXT) TO authenticated;
