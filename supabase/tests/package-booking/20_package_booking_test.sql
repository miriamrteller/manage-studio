-- Package booking options: online booking switch, price display, deposit.
-- Fixture: client-portal seed. Photo studio "photo" (a…01) with package "Wedding" (e…01, 120 min).
SET client_min_messages = notice;

-- Booking on, open every day 09:00–18:00, notice 0 so tomorrow is always in range.
INSERT INTO tenant_scheduling_settings (tenant_id, is_booking_enabled, advance_notice_hrs)
VALUES ('a0000000-0000-4000-8000-000000000001', true, 0);
INSERT INTO tenant_scheduling_hours (tenant_id, day_of_week, start_time, end_time)
SELECT 'a0000000-0000-4000-8000-000000000001', d, '09:00', '18:00' FROM generate_series(0, 6) d;
UPDATE offerings SET price_minor = 500000, status = 'active', is_public = true
WHERE id = 'e0000000-0000-4000-8000-000000000001';

-- 1. Defaults keep today's behaviour: bookable, price shown, no deposit.
DO $$
DECLARE o offerings%ROWTYPE; r RECORD;
BEGIN
  SELECT * INTO o FROM offerings WHERE id = 'e0000000-0000-4000-8000-000000000001';
  IF NOT o.online_booking OR o.price_display <> 'show' OR o.deposit_minor IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL defaults: % % %', o.online_booking, o.price_display, o.deposit_minor;
  END IF;
  SELECT * INTO r FROM get_bookable_offerings_by_subdomain('photo') WHERE id = o.id;
  IF r.price_minor <> 500000 OR NOT r.online_booking OR r.price_display <> 'show' THEN
    RAISE EXCEPTION 'FAIL public list defaults';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM get_available_slots('photo', o.id, (now() AT TIME ZONE 'Asia/Jerusalem')::date + 1)) THEN
    RAISE EXCEPTION 'FAIL no free times for a bookable package';
  END IF;
  RAISE NOTICE 'ok  defaults keep packages bookable with the price shown';
END $$;

-- 2. Price on request: no price sent, not bookable, no free times, hold refused.
DO $$
DECLARE r RECORD; v_day DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date + 1;
BEGIN
  UPDATE offerings SET price_display = 'on_request' WHERE id = 'e0000000-0000-4000-8000-000000000001';
  SELECT * INTO r FROM get_bookable_offerings_by_subdomain('photo') WHERE id = 'e0000000-0000-4000-8000-000000000001';
  IF r.price_minor IS NOT NULL OR r.online_booking OR r.price_display <> 'on_request' THEN
    RAISE EXCEPTION 'FAIL price on request still sends a price or is bookable';
  END IF;
  IF EXISTS (SELECT 1 FROM get_available_slots('photo', 'e0000000-0000-4000-8000-000000000001', v_day)) THEN
    RAISE EXCEPTION 'FAIL free times for a price-on-request package';
  END IF;
  BEGIN
    PERFORM create_scheduling_hold('photo', 'e0000000-0000-4000-8000-000000000001',
      (v_day + time '10:00') AT TIME ZONE 'Asia/Jerusalem', (v_day + time '12:00') AT TIME ZONE 'Asia/Jerusalem',
      'Test', 'test@x.test');
    RAISE EXCEPTION 'FAIL hold allowed for a price-on-request package';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%offering not bookable%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  price on request hides the price and cannot be booked';
END $$;

-- 3. "From" price: price sent, still bookable.
DO $$
DECLARE r RECORD;
BEGIN
  UPDATE offerings SET price_display = 'from' WHERE id = 'e0000000-0000-4000-8000-000000000001';
  SELECT * INTO r FROM get_bookable_offerings_by_subdomain('photo') WHERE id = 'e0000000-0000-4000-8000-000000000001';
  IF r.price_minor <> 500000 OR NOT r.online_booking THEN RAISE EXCEPTION 'FAIL from price'; END IF;
  RAISE NOTICE 'ok  "From" price is shown and bookable';
END $$;

-- 4. Online booking off: listed (enquire), no free times, hold refused.
DO $$
DECLARE r RECORD; v_day DATE := (now() AT TIME ZONE 'Asia/Jerusalem')::date + 1;
BEGIN
  UPDATE offerings SET price_display = 'show', online_booking = false WHERE id = 'e0000000-0000-4000-8000-000000000001';
  SELECT * INTO r FROM get_bookable_offerings_by_subdomain('photo') WHERE id = 'e0000000-0000-4000-8000-000000000001';
  IF r.id IS NULL OR r.online_booking THEN RAISE EXCEPTION 'FAIL online booking off not listed as enquiry'; END IF;
  IF EXISTS (SELECT 1 FROM get_available_slots('photo', 'e0000000-0000-4000-8000-000000000001', v_day)) THEN
    RAISE EXCEPTION 'FAIL free times with online booking off';
  END IF;
  BEGIN
    PERFORM create_scheduling_hold('photo', 'e0000000-0000-4000-8000-000000000001',
      (v_day + time '10:00') AT TIME ZONE 'Asia/Jerusalem', (v_day + time '12:00') AT TIME ZONE 'Asia/Jerusalem',
      'Test', 'test@x.test');
    RAISE EXCEPTION 'FAIL hold allowed with online booking off';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%offering not bookable%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'ok  online booking off: listed for enquiry, not bookable';
END $$;

-- 5. Hidden from the booking page: not listed at all.
DO $$
BEGIN
  UPDATE offerings SET online_booking = true, is_public = false WHERE id = 'e0000000-0000-4000-8000-000000000001';
  IF EXISTS (SELECT 1 FROM get_bookable_offerings_by_subdomain('photo') WHERE id = 'e0000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FAIL hidden package listed';
  END IF;
  RAISE NOTICE 'ok  hidden package not listed';
END $$;

-- 6. Deposit: stored, never negative.
DO $$
BEGIN
  UPDATE offerings SET deposit_minor = 150000 WHERE id = 'e0000000-0000-4000-8000-000000000001';
  BEGIN
    UPDATE offerings SET deposit_minor = -1 WHERE id = 'e0000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL negative deposit accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE offerings SET price_display = 'cheap' WHERE id = 'e0000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FAIL unknown price display accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok  deposit and price display are checked';
END $$;
