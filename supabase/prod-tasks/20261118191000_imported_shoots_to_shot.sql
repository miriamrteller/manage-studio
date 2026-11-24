-- Imported past shoots: "Delivered" -> "Shot" (owner, 18 Nov 2026).
--
-- The client import (20261117114500) added each past shoot as delivered. The
-- photographer's shoots had happened, but no photos had been sent, so they must
-- show as shot. Migration 20261118190709 makes new imports start as shot; this
-- task corrects the shoots already imported.
--
-- Only shoots recorded in client_import_shoots that are still exactly as the
-- import left them: job_status and auto_status 'delivered', no gallery link and
-- no photo order. auto_status becomes 'shot', so the hourly status move still
-- takes them to Delivered once the gallery is shared or photos are delivered.
-- Expected count on 18 Nov 2026: job_details 33 rows (one studio). More than 100
-- raises and the whole file rolls back.
DO $$
DECLARE
  v_rows int;
BEGIN
  UPDATE job_details jd
  SET job_status = 'shot', auto_status = 'shot'
  WHERE jd.engagement_id IN (SELECT cis.engagement_id FROM client_import_shoots cis WHERE cis.tenant_id = jd.tenant_id)
    AND jd.job_status = 'delivered'
    AND jd.auto_status = 'delivered'
    AND NULLIF(trim(jd.gallery_url), '') IS NULL
    AND NOT EXISTS (SELECT 1 FROM job_photo_orders o WHERE o.engagement_id = jd.engagement_id);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 100 THEN
    RAISE EXCEPTION 'imported_shoots_to_shot: % rows, expected about 33', v_rows;
  END IF;
  RAISE NOTICE 'imported_shoots_to_shot: % shoots set to shot', v_rows;
END $$;
