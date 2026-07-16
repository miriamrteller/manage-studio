-- =============================================================================
-- 003700: offering_type discriminator — classes vs appointment-based services
-- Introduces offerings.offering_type ('class' | 'appointment') as the single
-- source of truth for what an offering is, replacing the ad-hoc is_bookable flag.
--   * class       — weekly group offering (day_of_week + start/end time), enrolment
--   * appointment — 1:1 bookable service (duration + availability rules), no slot
-- Relaxes the weekly-slot NOT NULL columns so appointments need no fake times,
-- backfills from is_bookable, recreates every RPC that classified offerings, then
-- drops is_bookable. Reuses offerings + engagements — NO new tables.
-- DEPENDENCIES: 000500, 001800, 003300, 003400
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema: discriminator + relaxed weekly-slot columns
-- -----------------------------------------------------------------------------
ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS offering_type TEXT NOT NULL DEFAULT 'class'
    CHECK (offering_type IN ('class', 'appointment'));

COMMENT ON COLUMN offerings.offering_type IS
  'class = weekly group offering (enrolment); appointment = 1:1 bookable service (native slot booking).';

-- Backfill from the legacy flag before it is dropped.
UPDATE offerings SET offering_type = 'appointment' WHERE is_bookable = true;

-- Weekly slot is class-only now — drop NOT NULL before clearing appointment slots.
ALTER TABLE offerings ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE offerings ALTER COLUMN end_time   DROP NOT NULL;

-- Appointments carry no weekly slot; availability comes from tenant_scheduling_hours.
UPDATE offerings
  SET day_of_week = NULL, start_time = NULL, end_time = NULL
  WHERE offering_type = 'appointment';

-- Appointments must have a concrete duration (no reliance on a tenant fallback for
-- the shape check); default any legacy rows that relied on the fallback.
UPDATE offerings SET duration_mins = 60
  WHERE offering_type = 'appointment' AND duration_mins IS NULL;

-- Shape guard: a class has a weekly slot; an appointment has a duration and no slot.
ALTER TABLE offerings ADD CONSTRAINT offerings_type_shape CHECK (
  (offering_type = 'class'
     AND start_time IS NOT NULL
     AND end_time   IS NOT NULL)
  OR
  (offering_type = 'appointment'
     AND duration_mins IS NOT NULL
     AND day_of_week   IS NULL
     AND start_time    IS NULL
     AND end_time      IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_offerings_type ON offerings(tenant_id, offering_type);

-- -----------------------------------------------------------------------------
-- Recreate every RPC that classified offerings so none references is_bookable and
-- class/appointment surfaces stay cleanly separated.
-- -----------------------------------------------------------------------------

-- Public classes list — classes only.
CREATE OR REPLACE FUNCTION get_public_offerings_by_subdomain(p_subdomain TEXT)
RETURNS TABLE (
  id                UUID,
  tenant_id         UUID,
  tenant_subdomain  TEXT,
  name              TEXT,
  day_of_week       INT,
  start_time        TIME,
  end_time          TIME,
  max_capacity      INT,
  min_age           INT,
  max_age           INT,
  price_minor       INT,
  currency          TEXT,
  season_id         UUID,
  season_start_date DATE,
  category_id       UUID,
  category_name     TEXT,
  status            TEXT,
  billing_mode      TEXT,
  billing_interval  TEXT,
  cover_image_path  TEXT,
  updated_at        TIMESTAMPTZ,
  waiver_required   BOOLEAN,
  location          TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_subdomain IS NULL OR trim(p_subdomain) = '' THEN
    RAISE EXCEPTION 'p_subdomain is required';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.tenant_id,
    t.subdomain,
    o.name,
    o.day_of_week,
    o.start_time,
    o.end_time,
    o.max_capacity,
    o.min_age,
    o.max_age,
    o.price_minor,
    o.currency,
    o.season_id,
    s.start_date AS season_start_date,
    o.category_id,
    c.name AS category_name,
    o.status,
    o.billing_mode,
    o.billing_interval,
    o.cover_image_path,
    o.updated_at,
    COALESCE(o.waiver_required, false) AS waiver_required,
    o.location
  FROM offerings o
  JOIN tenants t ON o.tenant_id = t.id
  LEFT JOIN seasons s ON s.id = o.season_id
  LEFT JOIN categories c ON c.id = o.category_id
  WHERE t.subdomain = trim(p_subdomain)
    AND o.offering_type = 'class'
    AND o.is_public = true
    AND o.status    = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_offerings_by_subdomain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_public_offerings_by_subdomain(TEXT) TO authenticated;

-- Public timetable — classes/sessions only.
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
    AND o.offering_type = 'class'
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
    AND o.offering_type = 'class'
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

-- Admin timetable — class recurrences + sessions + blocks + appointments.
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
  IF NOT (is_super_admin() OR p_tenant_id = get_my_tenant_id()) THEN
    RAISE EXCEPTION 'not authorised for tenant %', p_tenant_id;
  END IF;

  RETURN QUERY
  SELECT
    'session-' || os.id::text, 'session', o.name,
    ((os.session_date + os.start_time) AT TIME ZONE 'Asia/Jerusalem'),
    ((os.session_date + os.end_time)   AT TIME ZONE 'Asia/Jerusalem'),
    os.id, os.offering_id
  FROM offering_sessions os
  JOIN offerings o ON o.id = os.offering_id
  WHERE os.tenant_id = p_tenant_id
    AND ((os.session_date + os.start_time) AT TIME ZONE 'Asia/Jerusalem') < p_end
    AND ((os.session_date + os.end_time)   AT TIME ZONE 'Asia/Jerusalem') > p_start

  UNION ALL

  SELECT
    'offering-' || o.id::text || '-' || d::date::text, 'class', o.name,
    ((d::date + o.start_time) AT TIME ZONE 'Asia/Jerusalem'),
    ((d::date + o.end_time)   AT TIME ZONE 'Asia/Jerusalem'),
    o.id, o.id
  FROM offerings o
  CROSS JOIN generate_series(p_start::date, p_end::date, INTERVAL '1 day') AS d
  WHERE o.tenant_id = p_tenant_id
    AND o.offering_type = 'class'
    AND o.status = 'active'
    AND o.day_of_week IS NOT NULL
    AND o.day_of_week = EXTRACT(DOW FROM d)::int
    AND ((d::date + o.start_time) AT TIME ZONE 'Asia/Jerusalem') < p_end
    AND ((d::date + o.end_time)   AT TIME ZONE 'Asia/Jerusalem') > p_start
    AND NOT EXISTS (
      SELECT 1 FROM offering_sessions os2
      WHERE os2.offering_id = o.id AND os2.session_date = d::date
    )

  UNION ALL

  SELECT
    'block-' || b.id::text, 'blocked', b.summary,
    b.start_time, b.end_time, b.id, NULL::uuid
  FROM scheduling_blocks b
  WHERE b.tenant_id = p_tenant_id
    AND b.start_time < p_end AND b.end_time > p_start

  UNION ALL

  SELECT
    'appt-' || e.id::text, 'appointment',
    o.name || ' — ' || p.name,
    e.booked_starts_at, e.booked_ends_at, e.id, e.offering_id
  FROM engagements e
  JOIN offerings o ON o.id = e.offering_id
  JOIN people p ON p.id = e.person_id
  WHERE e.tenant_id = p_tenant_id
    AND e.booked_starts_at IS NOT NULL
    AND e.status IN ('pending_payment','active')
    AND e.booked_starts_at < p_end AND e.booked_ends_at > p_start;
END;
$$;

GRANT EXECUTE ON FUNCTION get_schedule_events(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- Public bookable services list — appointments only.
CREATE OR REPLACE FUNCTION get_bookable_offerings_by_subdomain(p_subdomain TEXT)
RETURNS TABLE (
  id            UUID,
  name          TEXT,
  duration_mins INT,
  price_minor   INT,
  currency      TEXT,
  location      TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_subdomain IS NULL OR trim(p_subdomain) = '' THEN
    RAISE EXCEPTION 'p_subdomain is required';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    COALESCE(o.duration_mins, s.slot_duration_mins) AS duration_mins,
    o.price_minor,
    o.currency,
    o.location
  FROM offerings o
  JOIN tenants t ON t.id = o.tenant_id
  LEFT JOIN tenant_scheduling_settings s ON s.tenant_id = t.id
  WHERE t.subdomain = trim(p_subdomain)
    AND o.offering_type = 'appointment'
    AND o.status = 'active'
    AND COALESCE(s.is_booking_enabled, false) = true;
END;
$$;

GRANT EXECUTE ON FUNCTION get_bookable_offerings_by_subdomain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_bookable_offerings_by_subdomain(TEXT) TO authenticated;

-- Public availability — appointment offerings only.
CREATE OR REPLACE FUNCTION get_available_slots(
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

  -- Offering must belong to tenant and be an appointment service
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

  -- Enforce max_per_day (tenant-wide booked engagements + open holds on this date)
  IF v_settings.max_per_day IS NOT NULL THEN
    SELECT
      (SELECT count(*) FROM engagements e
        WHERE e.tenant_id = v_tenant_id
          AND e.booked_starts_at IS NOT NULL
          AND e.status IN ('pending_payment','active')
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
  WITH candidates AS (
    SELECT gs AS slot_start,
           gs + make_interval(mins => v_duration) AS slot_end
    FROM tenant_scheduling_hours h
    CROSS JOIN LATERAL generate_series(
      ((p_date + h.start_time) AT TIME ZONE 'Asia/Jerusalem'),
      ((p_date + h.end_time)   AT TIME ZONE 'Asia/Jerusalem') - make_interval(mins => v_duration),
      make_interval(mins => v_step)
    ) AS gs
    WHERE h.tenant_id = v_tenant_id
      AND h.is_active = true
      AND h.day_of_week = EXTRACT(DOW FROM p_date)::int
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
        AND e.status IN ('pending_payment','active')
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

GRANT EXECUTE ON FUNCTION get_available_slots(TEXT, UUID, DATE) TO anon;
GRANT EXECUTE ON FUNCTION get_available_slots(TEXT, UUID, DATE) TO authenticated;

-- Slot hold — appointment offerings only.
CREATE OR REPLACE FUNCTION create_scheduling_hold(
  p_subdomain    TEXT,
  p_offering_id  UUID,
  p_starts_at    TIMESTAMPTZ,
  p_ends_at      TIMESTAMPTZ,
  p_client_name  TEXT,
  p_client_email TEXT,
  p_client_phone TEXT DEFAULT NULL
)
RETURNS TABLE (
  hold_id    UUID,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_settings  tenant_scheduling_settings%ROWTYPE;
  v_expires   TIMESTAMPTZ;
  v_hold_id   UUID;
BEGIN
  IF p_ends_at <= p_starts_at THEN RAISE EXCEPTION 'invalid slot range'; END IF;

  SELECT t.id INTO v_tenant_id FROM tenants t WHERE t.subdomain = trim(p_subdomain) LIMIT 1;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant not found'; END IF;

  SELECT * INTO v_settings FROM tenant_scheduling_settings WHERE tenant_id = v_tenant_id;
  IF NOT FOUND OR NOT v_settings.is_booking_enabled THEN RAISE EXCEPTION 'booking not enabled'; END IF;

  PERFORM 1 FROM offerings o
  WHERE o.id = p_offering_id AND o.tenant_id = v_tenant_id
    AND o.offering_type = 'appointment' AND o.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'offering not bookable'; END IF;

  -- Serialize hold creation per tenant to avoid double-booking races
  PERFORM pg_advisory_xact_lock(hashtext(v_tenant_id::text));

  IF EXISTS (
    SELECT 1 FROM scheduling_holds hd
    WHERE hd.tenant_id = v_tenant_id AND hd.released_at IS NULL AND hd.expires_at > now()
      AND hd.starts_at < p_ends_at AND hd.ends_at > p_starts_at
  ) OR EXISTS (
    SELECT 1 FROM engagements e
    WHERE e.tenant_id = v_tenant_id AND e.booked_starts_at IS NOT NULL
      AND e.status IN ('pending_payment','active')
      AND e.booked_starts_at < p_ends_at AND e.booked_ends_at > p_starts_at
  ) OR EXISTS (
    SELECT 1 FROM scheduling_blocks b
    WHERE b.tenant_id = v_tenant_id AND b.start_time < p_ends_at AND b.end_time > p_starts_at
  ) THEN
    RAISE EXCEPTION 'slot no longer available';
  END IF;

  v_expires := now() + make_interval(mins => v_settings.hold_expiry_mins);

  INSERT INTO scheduling_holds (
    tenant_id, offering_id, starts_at, ends_at, expires_at, client_name, client_email, client_phone
  ) VALUES (
    v_tenant_id, p_offering_id, p_starts_at, p_ends_at, v_expires, p_client_name, p_client_email, p_client_phone
  ) RETURNING id INTO v_hold_id;

  hold_id := v_hold_id;
  expires_at := v_expires;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION create_scheduling_hold(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION create_scheduling_hold(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Drop the legacy flag now that offering_type is canonical and no RPC uses it.
-- -----------------------------------------------------------------------------
ALTER TABLE offerings DROP COLUMN IF EXISTS is_bookable;
