-- =============================================================================
-- 004100: Atomic replace for tenant_scheduling_hours
-- Client delete-then-insert could wipe hours if the insert failed mid-way.
-- This SECURITY DEFINER RPC runs both steps in one transaction.
-- DEPENDENCIES: 003400, 003800
-- =============================================================================

CREATE OR REPLACE FUNCTION public.replace_tenant_scheduling_hours(p_hours jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID := get_my_tenant_id();
  v_row jsonb;
  v_dow int;
  v_start time;
  v_end time;
  v_active boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND tenant_id = v_tenant_id
      AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_hours IS NULL OR jsonb_typeof(p_hours) <> 'array' THEN
    RAISE EXCEPTION 'p_hours must be a JSON array';
  END IF;

  DELETE FROM tenant_scheduling_hours WHERE tenant_id = v_tenant_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_hours)
  LOOP
    v_dow := (v_row->>'day_of_week')::int;
    v_start := (v_row->>'start_time')::time;
    v_end := (v_row->>'end_time')::time;
    v_active := COALESCE((v_row->>'is_active')::boolean, true);

    IF v_dow IS NULL OR v_dow < 0 OR v_dow > 6 THEN
      RAISE EXCEPTION 'Invalid day_of_week';
    END IF;
    IF v_start IS NULL OR v_end IS NULL OR v_end <= v_start THEN
      RAISE EXCEPTION 'Invalid time range';
    END IF;

    INSERT INTO tenant_scheduling_hours (
      tenant_id, day_of_week, start_time, end_time, is_active
    ) VALUES (
      v_tenant_id, v_dow, v_start, v_end, v_active
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_tenant_scheduling_hours(jsonb) TO authenticated;
