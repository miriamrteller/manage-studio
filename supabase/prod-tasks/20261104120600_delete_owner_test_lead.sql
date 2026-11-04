-- Removes the one test lead that was created while trying out the lead form with the owner's
-- previous email address (a test record, not a real enquiry), and its alert row in the notification log.
--
-- Found by id, with checks first, so nothing else can be touched:
--   - exactly that one lead exists, it was created on 2026-11-03, and nothing depends on it
--     (no quote, job or consent record);
--   - the notification-log row is the studio alert sent within seconds of that lead.
-- Any other count raises and the whole file rolls back.
DO $$
DECLARE
  v_lead  CONSTANT uuid := '30f42352-bbdc-4ce8-8cf3-a7b3e53a3873';
  v_alert CONSTANT uuid := '82e7c448-746b-4b57-8c43-bb8136e9e860';
  v_rows  int;
BEGIN
  IF (SELECT count(*) FROM leads WHERE id = v_lead AND created_at >= '2026-11-03' AND created_at < '2026-11-04') <> 1 THEN
    RAISE EXCEPTION 'delete_owner_test_lead: the test lead was not found as expected';
  END IF;
  IF EXISTS (SELECT 1 FROM quotes WHERE lead_id = v_lead)
     OR EXISTS (SELECT 1 FROM job_details WHERE lead_id = v_lead)
     OR EXISTS (SELECT 1 FROM consent_records WHERE lead_id = v_lead) THEN
    RAISE EXCEPTION 'delete_owner_test_lead: the lead has quotes, jobs or consent records; not a plain test lead';
  END IF;

  DELETE FROM notification_log
   WHERE id = v_alert
     AND template_name = 'crm_new_lead'
     AND created_at >= '2026-11-03 12:11:00+00' AND created_at < '2026-11-03 12:12:00+00';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 1 THEN
    RAISE EXCEPTION 'delete_owner_test_lead: notification_log changed % rows, expected 0 or 1', v_rows;
  END IF;

  DELETE FROM leads WHERE id = v_lead;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'delete_owner_test_lead: leads changed % rows, expected 1', v_rows;
  END IF;
END $$;
