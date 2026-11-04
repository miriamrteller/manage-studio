-- =============================================================================
-- 20261104212714: Package booking options
-- Each appointment offering (a "package" for photographers) gets:
--   online_booking  – clients can pick a time and book it online (default on, as today)
--   price_display   – show | from ("From ₪X") | on_request ("Price on request")
--   deposit_minor   – deposit amount for the package (NULL = none set)
-- The public booking list returns these fields (and only packages shown on the
-- booking page). Free times and holds refuse packages that can't be booked online.
-- =============================================================================

ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS online_booking BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS price_display  TEXT    NOT NULL DEFAULT 'show',
  ADD COLUMN IF NOT EXISTS deposit_minor  INT;

ALTER TABLE offerings
  ADD CONSTRAINT offerings_price_display_check
    CHECK (price_display IN ('show', 'from', 'on_request')),
  ADD CONSTRAINT offerings_deposit_minor_check
    CHECK (deposit_minor IS NULL OR deposit_minor >= 0);

COMMENT ON COLUMN offerings.online_booking IS
  'Appointment offerings: clients can pick a free time and book online. Off = enquiry only.';
COMMENT ON COLUMN offerings.price_display IS
  'How the price shows to clients: show (the price), from ("From" the price), on_request (no price; clients enquire).';
COMMENT ON COLUMN offerings.deposit_minor IS
  'Deposit for the package in minor units. NULL = no deposit set.';

-- ── Public booking list: new fields, only packages shown on the booking page ──
DROP FUNCTION IF EXISTS get_bookable_offerings_by_subdomain(TEXT);

CREATE FUNCTION get_bookable_offerings_by_subdomain(p_subdomain TEXT)
RETURNS TABLE (
  id             UUID,
  name           TEXT,
  duration_mins  INT,
  price_minor    INT,
  currency       TEXT,
  location       TEXT,
  online_booking BOOLEAN,
  price_display  TEXT
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
    -- "Price on request" never sends the price to the public page.
    CASE WHEN o.price_display = 'on_request' THEN NULL ELSE o.price_minor END AS price_minor,
    o.currency,
    o.location,
    (o.online_booking AND o.price_display <> 'on_request') AS online_booking,
    o.price_display
  FROM offerings o
  JOIN tenants t ON t.id = o.tenant_id
  LEFT JOIN tenant_scheduling_settings s ON s.tenant_id = t.id
  WHERE t.subdomain = trim(p_subdomain)
    AND o.offering_type = 'appointment'
    AND o.status = 'active'
    AND o.is_public = true
    AND COALESCE(s.is_booking_enabled, false) = true;
END;
$$;

REVOKE ALL ON FUNCTION get_bookable_offerings_by_subdomain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_bookable_offerings_by_subdomain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_bookable_offerings_by_subdomain(TEXT) TO authenticated;

-- ── Free times: only packages that can be booked online ──
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

  SELECT COALESCE(o.duration_mins, v_settings.slot_duration_mins) INTO v_duration
  FROM offerings o
  WHERE o.id = p_offering_id AND o.tenant_id = v_tenant_id
    AND o.offering_type = 'appointment' AND o.status = 'active'
    AND o.is_public AND o.online_booking AND o.price_display <> 'on_request';
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


-- ── Holds: same check ──
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
    AND o.offering_type = 'appointment' AND o.status = 'active'
    AND o.is_public AND o.online_booking AND o.price_display <> 'on_request';
  IF NOT FOUND THEN RAISE EXCEPTION 'offering not bookable'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_tenant_id::text));

  IF EXISTS (
    SELECT 1 FROM scheduling_holds hd
    WHERE hd.tenant_id = v_tenant_id AND hd.released_at IS NULL AND hd.expires_at > now()
      AND hd.starts_at < p_ends_at AND hd.ends_at > p_starts_at
  ) OR EXISTS (
    SELECT 1 FROM engagements e
    WHERE e.tenant_id = v_tenant_id AND e.booked_starts_at IS NOT NULL
      AND e.status IN ('pending_payment','active','pending_waiver')
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

