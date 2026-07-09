-- =============================================================================
-- 003400: Scheduling S2 — booking schema + holds + availability
-- Adds tenant_scheduling_settings, tenant_scheduling_hours, scheduling_holds;
-- extends engagements (booked_*) and offerings (is_bookable, duration_mins).
-- Adds availability + hold RPCs and extends get_schedule_events with appointments.
-- Reuses engagements as the booking SSOT — NO parallel appointments table.
-- DEPENDENCIES: 000300, 000500, 001300, 003300
-- =============================================================================

-- -----------------------------------------------------------------------------
-- tenant_scheduling_settings — one row per tenant
-- -----------------------------------------------------------------------------
CREATE TABLE tenant_scheduling_settings (
  tenant_id            UUID        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  buffer_mins          INT         NOT NULL DEFAULT 0  CHECK (buffer_mins >= 0),
  slot_duration_mins   INT         NOT NULL DEFAULT 60 CHECK (slot_duration_mins > 0),
  max_per_day          INT         CHECK (max_per_day IS NULL OR max_per_day > 0),
  advance_notice_hrs   INT         NOT NULL DEFAULT 24 CHECK (advance_notice_hrs >= 0),
  booking_window_days  INT         NOT NULL DEFAULT 60 CHECK (booking_window_days > 0),
  hold_expiry_mins     INT         NOT NULL DEFAULT 20
                       CHECK (hold_expiry_mins IN (15,20,25,30,45,60,90,120)),
  expiry_reminder_mins INT         CHECK (expiry_reminder_mins IS NULL OR expiry_reminder_mins IN (5,10,15)),
  is_booking_enabled   BOOLEAN     NOT NULL DEFAULT false,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tenant_scheduling_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin manages all scheduling_settings"
  ON tenant_scheduling_settings FOR ALL USING (is_super_admin());
CREATE POLICY "admins manage scheduling_settings"
  ON tenant_scheduling_settings FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
  );

-- -----------------------------------------------------------------------------
-- tenant_scheduling_hours — weekly availability windows
-- -----------------------------------------------------------------------------
CREATE TABLE tenant_scheduling_hours (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day_of_week INT         NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun
  start_time  TIME        NOT NULL,
  end_time    TIME        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_scheduling_hours_order CHECK (end_time > start_time)
);

CREATE INDEX idx_scheduling_hours_tenant_dow ON tenant_scheduling_hours(tenant_id, day_of_week);

ALTER TABLE tenant_scheduling_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin manages all scheduling_hours"
  ON tenant_scheduling_hours FOR ALL USING (is_super_admin());
CREATE POLICY "admins manage scheduling_hours"
  ON tenant_scheduling_hours FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
  );

-- -----------------------------------------------------------------------------
-- scheduling_holds — short-lived slot reservations
-- -----------------------------------------------------------------------------
CREATE TABLE scheduling_holds (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  offering_id      UUID        NOT NULL REFERENCES offerings(id),
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  client_name      TEXT,
  client_email     TEXT,
  client_phone     TEXT,
  engagement_id    UUID        REFERENCES engagements(id),
  reminder_sent_at TIMESTAMPTZ,
  released_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_holds_time_order CHECK (ends_at > starts_at)
);

CREATE INDEX idx_scheduling_holds_tenant_start ON scheduling_holds(tenant_id, starts_at);
CREATE INDEX idx_scheduling_holds_open_expiry  ON scheduling_holds(expires_at)
  WHERE released_at IS NULL AND engagement_id IS NULL;

ALTER TABLE scheduling_holds ENABLE ROW LEVEL SECURITY;
-- Public booking writes go through SECURITY DEFINER RPCs; admins can read/manage.
CREATE POLICY "super_admin manages all scheduling_holds"
  ON scheduling_holds FOR ALL USING (is_super_admin());
CREATE POLICY "admins manage scheduling_holds"
  ON scheduling_holds FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
  );

-- -----------------------------------------------------------------------------
-- Extend engagements (booking SSOT) and offerings (bookable services)
-- -----------------------------------------------------------------------------
ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS booked_starts_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booked_ends_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_event_id    TEXT,
  ADD COLUMN IF NOT EXISTS scheduling_hold_id UUID REFERENCES scheduling_holds(id);

ALTER TABLE engagements
  ADD CONSTRAINT engagements_booked_pair CHECK (
    (booked_starts_at IS NULL AND booked_ends_at IS NULL)
    OR (booked_starts_at IS NOT NULL AND booked_ends_at IS NOT NULL AND booked_ends_at > booked_starts_at)
  );

CREATE INDEX IF NOT EXISTS idx_engagements_booked_start
  ON engagements(tenant_id, booked_starts_at) WHERE booked_starts_at IS NOT NULL;

-- The no-season uniqueness guard is for group enrolments only. Appointments
-- (booked_starts_at set) legitimately repeat for the same person + offering, so
-- exempt them; otherwise a second booking of the same service would collide.
DROP INDEX IF EXISTS idx_engagements_active_no_season;
CREATE UNIQUE INDEX idx_engagements_active_no_season ON engagements(person_id, offering_id)
  WHERE status NOT IN ('cancelled', 'withdrawn') AND season_id IS NULL AND booked_starts_at IS NULL;

ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS is_bookable   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_mins INT     CHECK (duration_mins IS NULL OR duration_mins > 0);

COMMENT ON COLUMN offerings.is_bookable IS
  'When true this offering is a 1:1 bookable service (native slot booking), not a group class.';
COMMENT ON COLUMN offerings.duration_mins IS
  'Appointment length for bookable offerings; falls back to tenant_scheduling_settings.slot_duration_mins when null.';

-- -----------------------------------------------------------------------------
-- get_available_slots — public availability for a bookable offering on a date
-- Times computed in Asia/Jerusalem. Excludes holds, booked engagements, blocks.
-- (Google Calendar freebusy is layered in by the S3c migration.)
-- -----------------------------------------------------------------------------
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

  -- Offering must belong to tenant and be bookable
  SELECT COALESCE(o.duration_mins, v_settings.slot_duration_mins) INTO v_duration
  FROM offerings o
  WHERE o.id = p_offering_id AND o.tenant_id = v_tenant_id AND o.is_bookable = true AND o.status = 'active';
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

-- -----------------------------------------------------------------------------
-- create_scheduling_hold — reserve a slot (advisory-locked, re-validates)
-- -----------------------------------------------------------------------------
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
  WHERE o.id = p_offering_id AND o.tenant_id = v_tenant_id AND o.is_bookable = true AND o.status = 'active';
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
-- release_scheduling_hold — release a hold by id (idempotent)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION release_scheduling_hold(p_hold_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE scheduling_holds
  SET released_at = now()
  WHERE id = p_hold_id AND released_at IS NULL AND engagement_id IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION release_scheduling_hold(UUID) TO anon;
GRANT EXECUTE ON FUNCTION release_scheduling_hold(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Extend get_schedule_events with confirmed/pending appointments
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

-- -----------------------------------------------------------------------------
-- get_bookable_offerings_by_subdomain — public list of 1:1 services for /book
-- -----------------------------------------------------------------------------
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
    AND o.is_bookable = true
    AND o.status = 'active'
    AND COALESCE(s.is_booking_enabled, false) = true;
END;
$$;

GRANT EXECUTE ON FUNCTION get_bookable_offerings_by_subdomain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_bookable_offerings_by_subdomain(TEXT) TO authenticated;
