-- Client portal read model (ClientPortalService / useClientPortal): a client
-- sees only their own shoots, payment requests and gallery state, never
-- job_details (gallery_url / notes). Raises on the first failed expectation.
\set ON_ERROR_STOP 1
\pset tuples_only on
\o /dev/null

CREATE OR REPLACE FUNCTION pg_temp.expect(label TEXT, actual TEXT, expected TEXT) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL %: expected [%], got [%]', label, expected, actual;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.check_client(who TEXT, uid UUID, expect_shoots TEXT, expect_requests TEXT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v TEXT;
  denied BOOLEAN;
  eng UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Same reads as ClientPortalService.listShoots / listPaymentRequests.
  SELECT coalesce(string_agg(location, ',' ORDER BY location), '') INTO v
    FROM client_job_details WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.expect(who || ': client_job_details', v, expect_shoots);

  SELECT coalesce(string_agg(o.name || '@' || coalesce(p.account_id::text, '?'), ',' ORDER BY e.id), '') INTO v
    FROM engagements e
    JOIN offerings o ON o.id = e.offering_id
    LEFT JOIN people p ON p.id = e.person_id
    WHERE e.id IN (SELECT engagement_id FROM client_job_details);
  PERFORM pg_temp.expect(who || ': engagements behind the view are readable', (v <> '' OR expect_shoots = '')::text, 'true');

  SELECT coalesce(string_agg(label, ',' ORDER BY label), '') INTO v
    FROM job_payment_requests
    WHERE engagement_id IN ('f0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-00000000000b');
  PERFORM pg_temp.expect(who || ': job_payment_requests', v, expect_requests);

  SELECT count(*)::text INTO v FROM job_details;
  PERFORM pg_temp.expect(who || ': job_details is not readable', v, '0');

  -- Gallery RPC: allowed for own shoots, denied for anyone else's.
  FOREACH eng IN ARRAY ARRAY['f0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-00000000000b']::uuid[] LOOP
    BEGIN
      PERFORM get_client_job_gallery(eng);
      denied := false;
    EXCEPTION WHEN OTHERS THEN
      denied := true;
    END;
    SELECT location INTO v FROM job_details_location_probe WHERE engagement_id = eng;
    PERFORM pg_temp.expect(
      who || ': get_client_job_gallery(' || v || ') allowed only for own shoot',
      (NOT denied)::text,
      (position(v IN expect_shoots) > 0)::text
    );
  END LOOP;

  EXECUTE 'RESET ROLE';
END $$;

-- Locations by shoot, readable by everyone, only for the labels above.
CREATE TEMP TABLE job_details_location_probe AS SELECT engagement_id, location FROM job_details;
GRANT SELECT ON job_details_location_probe TO authenticated;

BEGIN; SELECT pg_temp.check_client('Alice (account holder)', 'b0000000-0000-4000-8000-00000000000a', 'Jaffa', 'Deposit A'); COMMIT;
BEGIN; SELECT pg_temp.check_client('Ari (partner on Alice''s account)', 'b0000000-0000-4000-8000-00000000000c', 'Jaffa', 'Deposit A'); COMMIT;
BEGIN; SELECT pg_temp.check_client('Bob (other client, same tenant)', 'b0000000-0000-4000-8000-00000000000b', 'Haifa', 'Deposit B'); COMMIT;
BEGIN; SELECT pg_temp.check_client('Dina (dance tenant)', 'b0000000-0000-4000-8000-00000000000d', '', ''); COMMIT;

-- The view never exposes the gated link or admin notes.
SELECT pg_temp.expect(
  'client_job_details has no gallery_url / notes',
  (SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns
    WHERE table_name = 'client_job_details' AND column_name IN ('gallery_url', 'notes', 'gallery_released_at')),
  NULL
);

-- A login that is ALSO a tenant admin gets every job from the view; the portal
-- narrows to the client's own person/account (ClientPortalService.listShoots,
-- covered by client-portal-service.test.ts).
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-00000000000e', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect('admin: view returns all tenant jobs', (SELECT count(*)::text FROM client_job_details), '2');
COMMIT;

\o
\echo 'client portal RLS: all checks passed'
