-- =============================================================================
-- Finance admin: aggregated summary RPC (revenue, expenses, outstanding)
-- DEPENDENCIES: 000200, 000500, 001300, 001600, 20260625000100 (expenses)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_finance_summary(
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  net_revenue_minor        BIGINT,
  payment_count            BIGINT,
  outstanding_engagements  BIGINT,
  failed_payments_7d       BIGINT,
  net_expenses_minor       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_season_id UUID;
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

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  SELECT id INTO v_season_id
  FROM seasons
  WHERE tenant_id = v_tenant_id AND status = 'active'
  LIMIT 1;

  RETURN QUERY
  SELECT
    COALESCE((
      SELECT SUM(total_amount_minor)
      FROM payments
      WHERE tenant_id = v_tenant_id
        AND status IN ('succeeded', 'partially_refunded')
        AND paid_at IS NOT NULL
        AND paid_at::date BETWEEN p_start_date AND p_end_date
    ), 0)::bigint,
    COALESCE((
      SELECT COUNT(*)::bigint
      FROM payments
      WHERE tenant_id = v_tenant_id
        AND status = 'succeeded'
        AND charge_type IN ('initial', 'renewal')
        AND paid_at IS NOT NULL
        AND paid_at::date BETWEEN p_start_date AND p_end_date
    ), 0)::bigint,
    COALESCE((
      SELECT COUNT(*)::bigint
      FROM engagements
      WHERE tenant_id = v_tenant_id
        AND status = 'pending_payment'
        AND season_id IS NOT DISTINCT FROM v_season_id
    ), 0)::bigint,
    COALESCE((
      SELECT COUNT(*)::bigint
      FROM payments
      WHERE tenant_id = v_tenant_id
        AND status = 'failed'
        AND created_at >= (now() - interval '7 days')
    ), 0)::bigint,
    COALESCE((
      SELECT SUM(total_amount_minor)
      FROM expenses
      WHERE tenant_id = v_tenant_id
        AND expense_date BETWEEN p_start_date AND p_end_date
    ), 0)::bigint;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_finance_summary(DATE, DATE) TO authenticated;
