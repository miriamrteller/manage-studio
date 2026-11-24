-- Online booking is open by default: when a studio has not set any working
-- hours, clients can book Sunday to Thursday, 09:00 to 18:00 (Asia/Jerusalem).
-- The owner blocks off the times she can't do (scheduling_blocks); booked
-- shoots, holds and blocks are still skipped as before. Once the studio saves
-- its own hours, only those hours are used.
--
-- Same function as 20260608002600_scheduling.sql, except the `hrs` CTE.
-- CREATE OR REPLACE keeps the existing EXECUTE grants
-- (supabase/security/definer-execute.json: public).
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_subdomain   TEXT,
  p_offering_id UUID,
  p_date        DATE
)
RETURNS TABLE (
  starts_at TIMESTAMPTZ,
  ends_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  UUID;
  v_settings   tenant_scheduling_settings%ROWTYPE;
  v_duration   INT;
  v_step       INT;
  v_min_start  TIMESTAMPTZ;
  v_max_date   DATE;
  v_day_count  INT;
BEGIN
  IF p_subdomain IS NULL OR trim(p_subdomain) = '' THEN
    RAISE EXCEPTION 'p_subdomain is required';
  END IF;

  SELECT t.id INTO v_tenant_id FROM tenants t WHERE t.subdomain = trim(p_subdomain) LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_settings FROM tenant_scheduling_settings WHERE tenant_id = v_tenant_id;
  IF NOT FOUND OR NOT v_settings.is_booking_enabled THEN RETURN; END IF;

  SELECT COALESCE(o.duration_mins, v_settings.slot_duration_mins) INTO v_duration
  FROM offerings o
  WHERE o.id = p_offering_id AND o.tenant_id = v_tenant_id
    AND o.offering_type = 'appointment' AND o.status = 'active';
  IF v_duration IS NULL THEN RETURN; END IF;

  v_step := v_duration + v_settings.buffer_mins;
  v_min_start := now() + make_interval(hours => v_settings.advance_notice_hrs);
  v_max_date := ((now() AT TIME ZONE 'Asia/Jerusalem')::date + v_settings.booking_window_days);

  IF p_date > v_max_date OR p_date < (now() AT TIME ZONE 'Asia/Jerusalem')::date THEN
    RETURN;
  END IF;

  IF v_settings.max_per_day IS NOT NULL THEN
    SELECT
      (SELECT count(*) FROM engagements e
        WHERE e.tenant_id = v_tenant_id
          AND e.booked_starts_at IS NOT NULL
          AND e.status IN ('pending_payment','active','pending_waiver')
          AND (e.booked_starts_at AT TIME ZONE 'Asia/Jerusalem')::date = p_date)
      +
      (SELECT count(*) FROM scheduling_holds h
        WHERE h.tenant_id = v_tenant_id
          AND h.released_at IS NULL AND h.engagement_id IS NULL AND h.expires_at > now()
          AND (h.starts_at AT TIME ZONE 'Asia/Jerusalem')::date = p_date)
    INTO v_day_count;

    IF v_day_count >= v_settings.max_per_day THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  WITH hrs AS (
    -- The studio's own hours for this weekday.
    SELECT h.start_time, h.end_time
    FROM tenant_scheduling_hours h
    WHERE h.tenant_id = v_tenant_id
      AND h.is_active = true
      AND h.day_of_week = EXTRACT(DOW FROM p_date)::int
    UNION ALL
    -- No hours set at all: Sunday to Thursday, 09:00 to 18:00.
    SELECT TIME '09:00', TIME '18:00'
    WHERE EXTRACT(DOW FROM p_date)::int BETWEEN 0 AND 4
      AND NOT EXISTS (
        SELECT 1 FROM tenant_scheduling_hours h2
        WHERE h2.tenant_id = v_tenant_id AND h2.is_active = true
      )
  ),
  candidates AS (
    SELECT gs AS slot_start,
           gs + make_interval(mins => v_duration) AS slot_end
    FROM hrs h
    CROSS JOIN LATERAL generate_series(
      ((p_date + h.start_time) AT TIME ZONE 'Asia/Jerusalem'),
      ((p_date + h.end_time)   AT TIME ZONE 'Asia/Jerusalem') - make_interval(mins => v_duration),
      make_interval(mins => v_step)
    ) AS gs
  )
  SELECT c.slot_start, c.slot_end
  FROM candidates c
  WHERE c.slot_start >= v_min_start
    AND NOT EXISTS (
      SELECT 1 FROM scheduling_holds hd
      WHERE hd.tenant_id = v_tenant_id
        AND hd.released_at IS NULL AND hd.expires_at > now()
        AND hd.starts_at < c.slot_end AND hd.ends_at > c.slot_start
    )
    AND NOT EXISTS (
      SELECT 1 FROM engagements e
      WHERE e.tenant_id = v_tenant_id
        AND e.booked_starts_at IS NOT NULL
        AND e.status IN ('pending_payment','active','pending_waiver')
        AND e.booked_starts_at < c.slot_end AND e.booked_ends_at > c.slot_start
    )
    AND NOT EXISTS (
      SELECT 1 FROM scheduling_blocks b
      WHERE b.tenant_id = v_tenant_id
        AND b.start_time < c.slot_end AND b.end_time > c.slot_start
    )
  ORDER BY c.slot_start;
END;
$$;
