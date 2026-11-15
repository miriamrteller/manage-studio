CREATE TEMP TABLE ids AS SELECT
  gen_random_uuid() AS studio, gen_random_uuid() AS person, gen_random_uuid() AS offering,
  gen_random_uuid() AS paid, gen_random_uuid() AS owes, gen_random_uuid() AS released, gen_random_uuid() AS no_link;

INSERT INTO tenants (id, name, subdomain, contact_email)
SELECT studio, 'Photo studio', 'gr-' || substr(md5(random()::text), 1, 8), 's@example.test' FROM ids;
INSERT INTO people (id, tenant_id, name, email) SELECT person, studio, 'Client', 'client@example.test' FROM ids;
INSERT INTO offerings (id, tenant_id, name, offering_type, duration_mins)
SELECT offering, studio, 'Family shoot', 'appointment', 60 FROM ids;

INSERT INTO engagements (id, tenant_id, person_id, offering_id, status, booked_starts_at, booked_ends_at)
SELECT paid,     studio, person, offering, 'active', '2026-11-01 09:00+02'::timestamptz, '2026-11-01 10:00+02'::timestamptz FROM ids UNION ALL
SELECT owes,     studio, person, offering, 'active', '2026-11-02 09:00+02'::timestamptz, '2026-11-02 10:00+02'::timestamptz FROM ids UNION ALL
SELECT released, studio, person, offering, 'active', '2026-11-03 09:00+02'::timestamptz, '2026-11-03 10:00+02'::timestamptz FROM ids UNION ALL
SELECT no_link,  studio, person, offering, 'active', '2026-11-04 09:00+02'::timestamptz, '2026-11-04 10:00+02'::timestamptz FROM ids;

INSERT INTO job_details (engagement_id, tenant_id, job_status, gallery_url, gallery_released_at)
SELECT paid,     studio, 'editing', 'https://photos.example.test/paid'::text, NULL::timestamptz FROM ids UNION ALL
SELECT owes,     studio, 'editing', 'https://photos.example.test/owes', NULL FROM ids UNION ALL
SELECT released, studio, 'editing', 'https://photos.example.test/rel', '2026-11-14 10:00+02'::timestamptz FROM ids UNION ALL
SELECT no_link,  studio, 'editing', NULL, NULL FROM ids;

INSERT INTO job_payment_requests (tenant_id, engagement_id, label, amount_minor)
SELECT studio, e, 'Balance', 50000 FROM ids, unnest(ARRAY[paid, owes, released, no_link]) AS e;

-- Paid in full: the paid and no-link projects (a request is paid with its payment).
DO $$
DECLARE r job_payment_requests%ROWTYPE; v_pay uuid;
BEGIN
  FOR r IN SELECT q.* FROM job_payment_requests q, ids WHERE q.engagement_id IN (ids.paid, ids.no_link) LOOP
    INSERT INTO payments (tenant_id, person_id, provider, status, pretax_amount_minor, total_amount_minor, currency)
    VALUES (r.tenant_id, (SELECT person FROM ids), 'manual', 'succeeded', r.amount_minor, r.amount_minor, 'ILS') RETURNING id INTO v_pay;
    UPDATE job_payment_requests SET status = 'paid', payment_id = v_pay, paid_at = '2026-11-10 10:00+02' WHERE id = r.id;
  END LOOP;
END $$;

CREATE FUNCTION pg_temp.due(p_now timestamptz) RETURNS TABLE (k text, eng uuid) LANGUAGE sql AS $$
  SELECT email_key, engagement_id FROM list_due_shoot_emails(p_now) WHERE email_key IN ('gallery_ready', 'review_request')
$$;

DO $$
DECLARE
  v ids%ROWTYPE;
  v_result jsonb;
  v_shared timestamptz;
BEGIN
  SELECT * INTO v FROM ids;
  -- Each test starts from galleries that were not visible when the migration ran.
  UPDATE job_details SET gallery_shared_at = NULL WHERE tenant_id = v.studio;

  -- Before the hourly run: the paid client's gallery has no "shared" moment yet.
  IF EXISTS (SELECT 1 FROM pg_temp.due('2026-11-15 10:00+02') WHERE eng = v.paid) THEN
    RAISE EXCEPTION 'FAIL paid gallery due before it was marked shared';
  END IF;

  v_result := advance_job_statuses('2026-11-15 10:00+02');
  IF (v_result->>'gallery_shared')::int <> 2 THEN RAISE EXCEPTION 'FAIL shared count: %', v_result; END IF;
  SELECT gallery_shared_at INTO v_shared FROM job_details WHERE engagement_id = v.paid;
  IF v_shared IS DISTINCT FROM '2026-11-15 10:00+02'::timestamptz THEN RAISE EXCEPTION 'FAIL paid shared_at: %', v_shared; END IF;
  IF (SELECT gallery_shared_at FROM job_details WHERE engagement_id = v.owes) IS NOT NULL THEN RAISE EXCEPTION 'FAIL unpaid marked shared'; END IF;
  IF (SELECT gallery_shared_at FROM job_details WHERE engagement_id = v.no_link) IS NOT NULL THEN RAISE EXCEPTION 'FAIL no link marked shared'; END IF;

  -- The paid client's gallery-ready email is now due; the unpaid one's is not.
  IF NOT EXISTS (SELECT 1 FROM pg_temp.due('2026-11-15 10:05+02') WHERE eng = v.paid AND k = 'gallery_ready') THEN
    RAISE EXCEPTION 'FAIL paid gallery_ready not due';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_temp.due('2026-11-15 10:05+02') WHERE eng = v.owes) THEN RAISE EXCEPTION 'FAIL unpaid due'; END IF;
  -- Released by hand ("Release anyway") still works as before.
  IF NOT EXISTS (SELECT 1 FROM pg_temp.due('2026-11-15 10:05+02') WHERE eng = v.released AND k = 'gallery_ready') THEN
    RAISE EXCEPTION 'FAIL released gallery_ready not due';
  END IF;
  -- Review request 5 days after it was shared.
  IF NOT EXISTS (SELECT 1 FROM pg_temp.due('2026-11-21 10:00+02') WHERE eng = v.paid AND k = 'review_request') THEN
    -- Only when the studio has a review link.
    UPDATE tenants SET review_url = 'https://reviews.example.test/studio' WHERE id = v.studio;
    IF NOT EXISTS (SELECT 1 FROM pg_temp.due('2026-11-21 10:00+02') WHERE eng = v.paid AND k = 'review_request') THEN
      RAISE EXCEPTION 'FAIL review_request not due';
    END IF;
  END IF;

  -- Un-released and no longer visible: nothing is sent.
  UPDATE job_details SET gallery_released_at = NULL WHERE engagement_id = v.released;
  UPDATE job_details SET gallery_shared_at = '2026-11-15 09:00+02' WHERE engagement_id = v.released;
  IF EXISTS (SELECT 1 FROM pg_temp.due('2026-11-15 10:05+02') WHERE eng = v.released) THEN RAISE EXCEPTION 'FAIL hidden gallery due'; END IF;

  -- The moment is kept: a second run does not move it.
  v_result := advance_job_statuses('2026-11-16 10:00+02');
  IF (SELECT gallery_shared_at FROM job_details WHERE engagement_id = v.paid) <> '2026-11-15 10:00+02'::timestamptz THEN
    RAISE EXCEPTION 'FAIL shared_at moved';
  END IF;

  RAISE NOTICE 'gallery-ready-when-paid: all checks passed';
END $$;
