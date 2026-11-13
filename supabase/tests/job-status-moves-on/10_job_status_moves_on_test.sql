CREATE TEMP TABLE ids AS SELECT
  gen_random_uuid() AS studio, gen_random_uuid() AS person, gen_random_uuid() AS offering,
  gen_random_uuid() AS past, gen_random_uuid() AS future, gen_random_uuid() AS gallery,
  gen_random_uuid() AS sent_photos, gen_random_uuid() AS cancelled, gen_random_uuid() AS by_hand;

INSERT INTO tenants (id, name, subdomain, contact_email)
SELECT studio, 'Photo studio', 'js-' || substr(md5(random()::text), 1, 8), 's@example.test' FROM ids;
INSERT INTO people (id, tenant_id, name) SELECT person, studio, 'Client' FROM ids;
INSERT INTO offerings (id, tenant_id, name, offering_type, duration_mins)
SELECT offering, studio, 'Family shoot', 'appointment', 60 FROM ids;

-- Shoot days are relative to the fixed "now" passed below (15 Nov 2026, 10:00 Israel time).
INSERT INTO engagements (id, tenant_id, person_id, offering_id, status, booked_starts_at, booked_ends_at)
SELECT past,        studio, person, offering, 'active',    '2026-11-14 09:00+02'::timestamptz, '2026-11-14 09:00+02'::timestamptz + interval '1 hour' FROM ids UNION ALL
SELECT future,      studio, person, offering, 'active',    '2026-11-15 09:00+02'::timestamptz, '2026-11-15 09:00+02'::timestamptz + interval '1 hour' FROM ids UNION ALL
SELECT gallery,     studio, person, offering, 'active',    '2026-11-01 09:00+02'::timestamptz, '2026-11-01 09:00+02'::timestamptz + interval '1 hour' FROM ids UNION ALL
SELECT sent_photos, studio, person, offering, 'active',    '2026-11-02 09:00+02'::timestamptz, '2026-11-02 09:00+02'::timestamptz + interval '1 hour' FROM ids UNION ALL
SELECT cancelled,   studio, person, offering, 'cancelled', '2026-11-03 09:00+02'::timestamptz, '2026-11-03 09:00+02'::timestamptz + interval '1 hour' FROM ids UNION ALL
SELECT by_hand,     studio, person, offering, 'active',    '2026-11-04 09:00+02'::timestamptz, '2026-11-04 09:00+02'::timestamptz + interval '1 hour' FROM ids;

INSERT INTO job_details (engagement_id, tenant_id, job_status, gallery_url, gallery_released_at)
SELECT past,        studio, 'booked',  NULL, NULL::timestamptz FROM ids UNION ALL
SELECT future,      studio, 'booked',  NULL, NULL::timestamptz FROM ids UNION ALL
SELECT gallery,     studio, 'editing', 'https://photos.example.test/g', '2026-11-10 10:00+02'::timestamptz FROM ids UNION ALL
SELECT sent_photos, studio, 'shot',    NULL, NULL::timestamptz FROM ids UNION ALL
SELECT cancelled,   studio, 'booked',  'https://photos.example.test/c', '2026-11-10 10:00+02'::timestamptz FROM ids UNION ALL
SELECT by_hand,     studio, 'booked',  NULL, NULL FROM ids;

INSERT INTO job_photo_shops (engagement_id, tenant_id, closes_at)
SELECT sent_photos, studio, '2026-12-31'::timestamptz FROM ids;
INSERT INTO job_photo_orders (tenant_id, engagement_id, status, photo_count, total_minor, currency, delivery_url, delivered_at)
SELECT studio, sent_photos, 'delivered', 3, 0, 'ILS', 'https://photos.example.test/d', '2026-11-12 10:00+02'::timestamptz FROM ids;

CREATE FUNCTION pg_temp.status_of(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT job_status FROM job_details WHERE engagement_id = p_id
$$;

DO $$
DECLARE
  v ids%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v FROM ids;

  v_result := advance_job_statuses('2026-11-15 10:00+02');
  IF v_result IS DISTINCT FROM '{"delivered": 2, "shot": 2}'::jsonb THEN RAISE EXCEPTION 'FAIL counts: %', v_result; END IF;
  IF pg_temp.status_of(v.past) <> 'shot' THEN RAISE EXCEPTION 'FAIL past shoot: %', pg_temp.status_of(v.past); END IF;
  IF pg_temp.status_of(v.future) <> 'booked' THEN RAISE EXCEPTION 'FAIL shoot today: %', pg_temp.status_of(v.future); END IF;
  IF pg_temp.status_of(v.gallery) <> 'delivered' THEN RAISE EXCEPTION 'FAIL gallery shared: %', pg_temp.status_of(v.gallery); END IF;
  IF pg_temp.status_of(v.sent_photos) <> 'delivered' THEN RAISE EXCEPTION 'FAIL photos sent: %', pg_temp.status_of(v.sent_photos); END IF;
  IF pg_temp.status_of(v.cancelled) <> 'booked' THEN RAISE EXCEPTION 'FAIL cancelled moved: %', pg_temp.status_of(v.cancelled); END IF;
  IF pg_temp.status_of(v.by_hand) <> 'shot' THEN RAISE EXCEPTION 'FAIL by-hand setup: %', pg_temp.status_of(v.by_hand); END IF;

  -- The studio sets statuses back by hand: the next runs leave them alone.
  UPDATE job_details SET job_status = 'booked' WHERE engagement_id = v.by_hand;
  UPDATE job_details SET job_status = 'editing' WHERE engagement_id = v.gallery;
  v_result := advance_job_statuses('2026-11-15 11:00+02');
  IF v_result IS DISTINCT FROM '{"delivered": 0, "shot": 0}'::jsonb THEN RAISE EXCEPTION 'FAIL second run: %', v_result; END IF;
  IF pg_temp.status_of(v.by_hand) <> 'booked' THEN RAISE EXCEPTION 'FAIL by-hand overridden: %', pg_temp.status_of(v.by_hand); END IF;
  IF pg_temp.status_of(v.gallery) <> 'editing' THEN RAISE EXCEPTION 'FAIL by-hand delivered overridden'; END IF;

  -- A shot project still moves to delivered once the gallery is shared.
  UPDATE job_details SET gallery_url = 'https://photos.example.test/p', gallery_released_at = '2026-11-15 10:30+02'
  WHERE engagement_id = v.past;
  v_result := advance_job_statuses('2026-11-15 12:00+02');
  IF pg_temp.status_of(v.past) <> 'delivered' THEN RAISE EXCEPTION 'FAIL shot to delivered: %', pg_temp.status_of(v.past); END IF;

  RAISE NOTICE 'job-status-moves-on: all checks passed';
END $$;
