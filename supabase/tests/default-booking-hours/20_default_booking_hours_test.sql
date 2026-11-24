-- Online booking open by default (20261111101700_default_booking_hours.sql).
-- Fixture: client-portal seed. Photographer studio (…01, subdomain "photo").
\o /dev/null
CREATE TEMP TABLE ids AS SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid AS studio,
  'e0000000-0000-4000-8000-0000000000c1'::uuid AS pkg,
  -- A Sunday and the Friday after it, at least two days ahead (past the 24h notice).
  (d + ((7 - EXTRACT(DOW FROM d)::int) % 7)) AS sun,
  (d + ((7 - EXTRACT(DOW FROM d)::int) % 7) + 5) AS fri
FROM (SELECT (now() AT TIME ZONE 'Asia/Jerusalem')::date + 2 AS d) x;
GRANT SELECT ON ids TO PUBLIC;

CREATE FUNCTION pg_temp.slots(p_date DATE) RETURNS INT LANGUAGE sql AS $$
  SELECT count(*)::int FROM get_available_slots('photo', (SELECT pkg FROM ids), p_date);
$$;

INSERT INTO offerings (id, tenant_id, name, offering_type, duration_mins, status)
SELECT pkg, studio, 'Family shoot', 'appointment', 60, 'active' FROM ids;
INSERT INTO tenant_scheduling_settings (tenant_id, is_booking_enabled)
SELECT studio, true FROM ids;
\o

DO $$
DECLARE n INT; first_start TEXT;
BEGIN
  -- 1. No hours set: Sunday 09:00-18:00, hourly, so nine start times.
  n := pg_temp.slots((SELECT sun FROM ids));
  IF n <> 9 THEN RAISE EXCEPTION 'FAIL default Sunday: expected 9 slots, got %', n; END IF;
  SELECT to_char(min(starts_at) AT TIME ZONE 'Asia/Jerusalem', 'HH24:MI') INTO first_start
    FROM get_available_slots('photo', (SELECT pkg FROM ids), (SELECT sun FROM ids));
  IF first_start <> '09:00' THEN RAISE EXCEPTION 'FAIL default Sunday starts at %', first_start; END IF;
  RAISE NOTICE 'ok  no hours set: Sunday is open 09:00 to 18:00';

  n := pg_temp.slots((SELECT fri FROM ids));
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL default Friday: expected 0 slots, got %', n; END IF;
  RAISE NOTICE 'ok  no hours set: Friday is closed';

  -- 2. A blocked time is taken off.
  INSERT INTO scheduling_blocks (tenant_id, start_time, end_time)
  SELECT studio, (sun + TIME '10:00') AT TIME ZONE 'Asia/Jerusalem', (sun + TIME '12:00') AT TIME ZONE 'Asia/Jerusalem' FROM ids;
  n := pg_temp.slots((SELECT sun FROM ids));
  IF n <> 7 THEN RAISE EXCEPTION 'FAIL blocked 10-12: expected 7 slots, got %', n; END IF;
  RAISE NOTICE 'ok  a blocked time is taken off the default hours';

  -- 3. Once the studio saves its own hours, only those count.
  INSERT INTO tenant_scheduling_hours (tenant_id, day_of_week, start_time, end_time)
  SELECT studio, 5, '09:00', '11:00' FROM ids;
  n := pg_temp.slots((SELECT sun FROM ids));
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL own hours: Sunday should be closed, got %', n; END IF;
  n := pg_temp.slots((SELECT fri FROM ids));
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL own hours: Friday expected 2 slots, got %', n; END IF;
  RAISE NOTICE 'ok  the studio''s own hours replace the default';

  -- 4. Online booking switched off: nothing.
  UPDATE tenant_scheduling_settings SET is_booking_enabled = false WHERE tenant_id = (SELECT studio FROM ids);
  DELETE FROM tenant_scheduling_hours WHERE tenant_id = (SELECT studio FROM ids);
  n := pg_temp.slots((SELECT sun FROM ids));
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL booking off: expected 0 slots, got %', n; END IF;
  RAISE NOTICE 'ok  booking switched off shows no times';
END $$;
