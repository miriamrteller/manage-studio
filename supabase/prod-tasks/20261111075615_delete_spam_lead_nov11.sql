-- Removes one more spam enquiry that reached OpalSwift HQ's Leads through the opalswift.com
-- contact form (channel website, 11 Nov 2026), and the "new lead" alert logged for it.
-- A bot submission: a made-up name and a stock "I wanted to know your price" line in a
-- language unrelated to the site. The owner asked for it to be deleted on 11 Nov 2026.
--
-- Found by id only (no names or emails in this file), with checks first:
--   - the lead exists, belongs to the hq studio, came in on the website channel on
--     2026-11-11, and nothing depends on it (no quote, job, consent record or form invite);
--   - the alert is the crm_new_lead row for hq logged within a minute of the lead.
-- Expected counts: notification_log 0 or 1 row, leads exactly 1 row.
-- Any other count raises and the whole file rolls back.
DO $$
DECLARE
  v_lead  CONSTANT uuid := '97170126-257f-45a6-8bce-754ad0ee12f1';
  v_alert CONSTANT uuid := '9f6acb60-6354-4517-a697-2057d939bf5a';
  v_hq    uuid;
  v_rows  int;
BEGIN
  SELECT id INTO v_hq FROM tenants WHERE subdomain = 'hq';
  IF v_hq IS NULL THEN
    RAISE EXCEPTION 'delete_spam_lead_nov11: the hq studio was not found';
  END IF;

  IF (SELECT count(*) FROM leads
       WHERE id = v_lead
         AND tenant_id = v_hq
         AND channel = 'website'
         AND created_at >= '2026-11-11' AND created_at < '2026-11-12') <> 1 THEN
    RAISE EXCEPTION 'delete_spam_lead_nov11: the spam lead was not found as expected';
  END IF;
  IF EXISTS (SELECT 1 FROM quotes WHERE lead_id = v_lead)
     OR EXISTS (SELECT 1 FROM job_details WHERE lead_id = v_lead)
     OR EXISTS (SELECT 1 FROM consent_records WHERE lead_id = v_lead)
     OR EXISTS (SELECT 1 FROM lead_form_invites WHERE lead_id = v_lead) THEN
    RAISE EXCEPTION 'delete_spam_lead_nov11: the lead has quotes, jobs, consent records or invites; not plain spam';
  END IF;

  DELETE FROM notification_log n
   WHERE n.id = v_alert
     AND n.tenant_id = v_hq
     AND n.template_name = 'crm_new_lead'
     AND EXISTS (
       SELECT 1 FROM leads l
        WHERE l.id = v_lead
          AND n.created_at >= l.created_at
          AND n.created_at < l.created_at + interval '1 minute'
     );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 1 THEN
    RAISE EXCEPTION 'delete_spam_lead_nov11: notification_log changed % rows, expected 0 or 1', v_rows;
  END IF;

  DELETE FROM leads WHERE id = v_lead AND tenant_id = v_hq;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'delete_spam_lead_nov11: leads changed % rows, expected 1', v_rows;
  END IF;
END $$;
