-- =============================================================================
-- 002600: Scheduling schema + final booking/Google RPCs
-- scheduling_blocks, settings, hours, holds; engagements.scheduling_hold_id FK;
-- final slot/hold/schedule RPCs; Google credential RPCs (extensions search_path).
-- DEPENDENCIES: 000300, 000500, 001300, 002500
-- =============================================================================

-- ── Calendar blocks (ex-03300) ──
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



-- ── Booking tables (ex-03400) ──
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


-- Wire engagements.scheduling_hold_id FK (column baked in 001300)
ALTER TABLE engagements
  ADD CONSTRAINT engagements_scheduling_hold_id_fkey
  FOREIGN KEY (scheduling_hold_id) REFERENCES scheduling_holds(id);


-- final from 03700: get_public_offerings_by_subdomain
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


-- final from 03700: get_public_schedule_events_by_subdomain
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


-- final from 03700: get_bookable_offerings_by_subdomain
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


-- final from 04200: get_available_slots
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

GRANT EXECUTE ON FUNCTION get_available_slots(TEXT, UUID, DATE) TO anon;
GRANT EXECUTE ON FUNCTION get_available_slots(TEXT, UUID, DATE) TO authenticated;


-- final from 04200: create_scheduling_hold
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

GRANT EXECUTE ON FUNCTION create_scheduling_hold(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION create_scheduling_hold(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO authenticated;


-- final from 04200: get_schedule_events
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
    AND e.status IN ('pending_payment','active','pending_waiver')
    AND e.booked_starts_at < p_end AND e.booked_ends_at > p_start;
END;
$$;

GRANT EXECUTE ON FUNCTION get_schedule_events(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- ex-04100
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



CREATE OR REPLACE FUNCTION disconnect_tenant_google_calendar(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tenants SET
    google_calendar_refresh_token_enc = NULL,
    google_calendar_access_token_enc  = NULL,
    google_calendar_token_expires_at  = NULL,
    google_calendar_email             = NULL,
    google_calendar_connected_at      = NULL,
    updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;


CREATE OR REPLACE FUNCTION get_google_calendar_connection()
RETURNS TABLE (
  connected BOOLEAN,
  email     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT (t.google_calendar_refresh_token_enc IS NOT NULL), t.google_calendar_email
  FROM tenants t WHERE t.id = v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_google_calendar_connection() TO authenticated;


-- Google credentials final (ex-04000)
CREATE OR REPLACE FUNCTION get_tenant_google_credentials(p_tenant_id UUID)
RETURNS TABLE (
  refresh_token     TEXT,
  access_token      TEXT,
  token_expires_at  TIMESTAMPTZ,
  calendar_id       TEXT,
  email             TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  enc_key := get_app_encryption_key();
  RETURN QUERY SELECT
    CASE WHEN t.google_calendar_refresh_token_enc IS NOT NULL
      THEN pgp_sym_decrypt(t.google_calendar_refresh_token_enc, enc_key) ELSE NULL END,
    CASE WHEN t.google_calendar_access_token_enc IS NOT NULL
      THEN pgp_sym_decrypt(t.google_calendar_access_token_enc, enc_key) ELSE NULL END,
    t.google_calendar_token_expires_at,
    COALESCE(t.google_calendar_id, 'primary'),
    t.google_calendar_email
  FROM tenants t WHERE t.id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_tenant_google_credentials(
  p_tenant_id     UUID,
  p_refresh_token TEXT,
  p_access_token  TEXT,
  p_expires_at    TIMESTAMPTZ,
  p_email         TEXT,
  p_calendar_id   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  enc_key := get_app_encryption_key();
  UPDATE tenants SET
    google_calendar_refresh_token_enc = CASE
      WHEN p_refresh_token IS NOT NULL AND trim(p_refresh_token) <> ''
      THEN pgp_sym_encrypt(trim(p_refresh_token), enc_key)
      ELSE google_calendar_refresh_token_enc END,
    google_calendar_access_token_enc = CASE
      WHEN p_access_token IS NOT NULL AND trim(p_access_token) <> ''
      THEN pgp_sym_encrypt(trim(p_access_token), enc_key)
      ELSE google_calendar_access_token_enc END,
    google_calendar_token_expires_at = COALESCE(p_expires_at, google_calendar_token_expires_at),
    google_calendar_email            = COALESCE(NULLIF(trim(p_email), ''), google_calendar_email),
    google_calendar_id               = COALESCE(NULLIF(trim(p_calendar_id), ''), google_calendar_id, 'primary'),
    google_calendar_connected_at     = COALESCE(google_calendar_connected_at, now()),
    updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_tenant_google_access_token(
  p_tenant_id    UUID,
  p_access_token TEXT,
  p_expires_at   TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  enc_key := get_app_encryption_key();
  UPDATE tenants SET
    google_calendar_access_token_enc = pgp_sym_encrypt(trim(p_access_token), enc_key),
    google_calendar_token_expires_at = p_expires_at,
    updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

-- Service-role only: decrypt / mutate Google OAuth secrets (ex-03600 lockdown)
REVOKE ALL ON FUNCTION get_tenant_google_credentials(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION save_tenant_google_credentials(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION update_tenant_google_access_token(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION disconnect_tenant_google_calendar(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_google_credentials(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION save_tenant_google_credentials(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION update_tenant_google_access_token(UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION disconnect_tenant_google_calendar(UUID) TO service_role;

