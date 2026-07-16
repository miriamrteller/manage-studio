-- =============================================================================
-- 003300: Scheduling S1 — calendar view (read-only timetable)
-- Adds scheduling_blocks (manually blocked time) and get_schedule_events() RPC
-- that aggregates offerings (weekly, expanded in Asia/Jerusalem), offering_sessions,
-- and blocks into a FullCalendar-friendly shape. Appointment rows are added by the
-- S2 migration (CREATE OR REPLACE) once engagements gain booked_* columns.
-- No projection table — this is computed on read.
-- DEPENDENCIES: 000200, 000500, 000800, 003000, 003100
-- =============================================================================

-- -----------------------------------------------------------------------------
-- scheduling_blocks — manually blocked time (no payment, no offering)
-- -----------------------------------------------------------------------------
CREATE TABLE scheduling_blocks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  summary     TEXT        NOT NULL DEFAULT 'חסום',
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  created_by  UUID        REFERENCES user_profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_blocks_time_order CHECK (end_time > start_time)
);

CREATE INDEX idx_scheduling_blocks_tenant_start ON scheduling_blocks(tenant_id, start_time);

ALTER TABLE scheduling_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all scheduling_blocks"
  ON scheduling_blocks FOR ALL USING (is_super_admin());
CREATE POLICY "admins manage scheduling_blocks"
  ON scheduling_blocks FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
  );

-- -----------------------------------------------------------------------------
-- get_schedule_events — admin timetable feed
-- Returns dated events for the requested [p_start, p_end] window.
-- Weekly offerings are expanded to concrete occurrences in Asia/Jerusalem.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_schedule_events(
  p_tenant_id UUID,
  p_start     TIMESTAMPTZ,
  p_end       TIMESTAMPTZ
)
RETURNS TABLE (
  id          TEXT,
  event_type  TEXT,
  title       TEXT,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  ref_id      UUID,
  offering_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;

  -- Only the owning tenant admin (or super admin) may read the timetable.
  IF NOT (is_super_admin() OR p_tenant_id = get_my_tenant_id()) THEN
    RAISE EXCEPTION 'not authorised for tenant %', p_tenant_id;
  END IF;

  RETURN QUERY
  -- Concrete session instances
  SELECT
    'session-' || os.id::text                                            AS id,
    'session'                                                            AS event_type,
    o.name                                                               AS title,
    ((os.session_date + os.start_time) AT TIME ZONE 'Asia/Jerusalem')    AS starts_at,
    ((os.session_date + os.end_time)   AT TIME ZONE 'Asia/Jerusalem')    AS ends_at,
    os.id                                                                AS ref_id,
    os.offering_id                                                       AS offering_id
  FROM offering_sessions os
  JOIN offerings o ON o.id = os.offering_id
  WHERE os.tenant_id = p_tenant_id
    AND ((os.session_date + os.start_time) AT TIME ZONE 'Asia/Jerusalem') < p_end
    AND ((os.session_date + os.end_time)   AT TIME ZONE 'Asia/Jerusalem') > p_start

  UNION ALL

  -- Weekly offerings expanded to occurrences (skip offerings that have concrete sessions)
  SELECT
    'offering-' || o.id::text || '-' || d::date::text                    AS id,
    'class'                                                              AS event_type,
    o.name                                                               AS title,
    ((d::date + o.start_time) AT TIME ZONE 'Asia/Jerusalem')             AS starts_at,
    ((d::date + o.end_time)   AT TIME ZONE 'Asia/Jerusalem')             AS ends_at,
    o.id                                                                 AS ref_id,
    o.id                                                                 AS offering_id
  FROM offerings o
  CROSS JOIN generate_series(p_start::date, p_end::date, INTERVAL '1 day') AS d
  WHERE o.tenant_id = p_tenant_id
    AND o.status = 'active'
    AND o.day_of_week IS NOT NULL
    AND o.day_of_week = EXTRACT(DOW FROM d)::int
    AND ((d::date + o.start_time) AT TIME ZONE 'Asia/Jerusalem') < p_end
    AND ((d::date + o.end_time)   AT TIME ZONE 'Asia/Jerusalem') > p_start
    AND NOT EXISTS (
      SELECT 1 FROM offering_sessions os2
      WHERE os2.offering_id = o.id
        AND os2.session_date = d::date
    )

  UNION ALL

  -- Manually blocked time
  SELECT
    'block-' || b.id::text                                               AS id,
    'blocked'                                                            AS event_type,
    b.summary                                                            AS title,
    b.start_time                                                         AS starts_at,
    b.end_time                                                           AS ends_at,
    b.id                                                                 AS ref_id,
    NULL::uuid                                                           AS offering_id
  FROM scheduling_blocks b
  WHERE b.tenant_id = p_tenant_id
    AND b.start_time < p_end
    AND b.end_time   > p_start;
END;
$$;

GRANT EXECUTE ON FUNCTION get_schedule_events(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- -----------------------------------------------------------------------------
-- get_public_schedule_events_by_subdomain — anon-safe public timetable
-- Public classes/sessions only (no blocks, no appointments).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_public_schedule_events_by_subdomain(
  p_subdomain TEXT,
  p_start     TIMESTAMPTZ,
  p_end       TIMESTAMPTZ
)
RETURNS TABLE (
  id          TEXT,
  event_type  TEXT,
  title       TEXT,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  offering_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF p_subdomain IS NULL OR trim(p_subdomain) = '' THEN
    RAISE EXCEPTION 'p_subdomain is required';
  END IF;

  SELECT t.id INTO v_tenant_id FROM tenants t WHERE t.subdomain = trim(p_subdomain) LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    'session-' || os.id::text,
    'session',
    o.name,
    ((os.session_date + os.start_time) AT TIME ZONE 'Asia/Jerusalem'),
    ((os.session_date + os.end_time)   AT TIME ZONE 'Asia/Jerusalem'),
    os.offering_id
  FROM offering_sessions os
  JOIN offerings o ON o.id = os.offering_id
  WHERE os.tenant_id = v_tenant_id
    AND o.is_public = true
    AND o.status = 'active'
    AND ((os.session_date + os.start_time) AT TIME ZONE 'Asia/Jerusalem') < p_end
    AND ((os.session_date + os.end_time)   AT TIME ZONE 'Asia/Jerusalem') > p_start

  UNION ALL

  SELECT
    'offering-' || o.id::text || '-' || d::date::text,
    'class',
    o.name,
    ((d::date + o.start_time) AT TIME ZONE 'Asia/Jerusalem'),
    ((d::date + o.end_time)   AT TIME ZONE 'Asia/Jerusalem'),
    o.id
  FROM offerings o
  CROSS JOIN generate_series(p_start::date, p_end::date, INTERVAL '1 day') AS d
  WHERE o.tenant_id = v_tenant_id
    AND o.is_public = true
    AND o.status = 'active'
    AND o.day_of_week IS NOT NULL
    AND o.day_of_week = EXTRACT(DOW FROM d)::int
    AND ((d::date + o.start_time) AT TIME ZONE 'Asia/Jerusalem') < p_end
    AND ((d::date + o.end_time)   AT TIME ZONE 'Asia/Jerusalem') > p_start
    AND NOT EXISTS (
      SELECT 1 FROM offering_sessions os2
      WHERE os2.offering_id = o.id
        AND os2.session_date = d::date
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_schedule_events_by_subdomain(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION get_public_schedule_events_by_subdomain(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
