-- Removes three spam enquiries that reached OpalSwift HQ's Leads through the opalswift.com
-- contact form (channel website, 6 to 9 Nov 2026), and the "new lead" alert logged for each.
-- They are bot submissions, not people: a name and message of letters glued to a run of digits,
-- a message of keyboard mashing, and a "get listed on Google" sales pitch from an address
-- imitating opalswift.com. Dry run first; the real run only after the owner confirms the list.
--
-- Found by id only (no names or emails in this file), with checks first:
--   - all three leads exist, belong to the hq studio, came in on the website channel,
--     between 2026-11-06 and 2026-11-10, and nothing depends on them
--     (no quote, job, consent record or form invite);
--   - each alert is the crm_new_lead row for hq logged within a minute of its lead.
-- Expected counts: notification_log 0 to 3 rows, leads exactly 3 rows.
-- Any other count raises and the whole file rolls back.
DO $$
DECLARE
  v_leads  CONSTANT uuid[] := ARRAY[
    '7dfb8c33-6c29-44ae-ab7d-a7d5ff0eec3f',
    'ab22fd27-2084-4d77-81a6-ce7a88523128',
    '0fc4c03e-c9b2-490f-b500-69628d60d9da'
  ]::uuid[];
  v_alerts CONSTANT uuid[] := ARRAY[
    '58a7abc7-cd2d-4e74-86bb-6e9818510026',
    '87ec51a9-311c-43d6-8aee-c06f8a8631f5',
    'd545c27e-6772-470a-b80d-4d4e757d0d1a'
  ]::uuid[];
  v_hq     uuid;
  v_rows   int;
BEGIN
  SELECT id INTO v_hq FROM tenants WHERE subdomain = 'hq';
  IF v_hq IS NULL THEN
    RAISE EXCEPTION 'delete_spam_leads: the hq studio was not found';
  END IF;

  IF (SELECT count(*) FROM leads
       WHERE id = ANY (v_leads)
         AND tenant_id = v_hq
         AND channel = 'website'
         AND created_at >= '2026-11-06' AND created_at < '2026-11-10') <> 3 THEN
    RAISE EXCEPTION 'delete_spam_leads: the three spam leads were not found as expected';
  END IF;
  IF EXISTS (SELECT 1 FROM quotes WHERE lead_id = ANY (v_leads))
     OR EXISTS (SELECT 1 FROM job_details WHERE lead_id = ANY (v_leads))
     OR EXISTS (SELECT 1 FROM consent_records WHERE lead_id = ANY (v_leads))
     OR EXISTS (SELECT 1 FROM lead_form_invites WHERE lead_id = ANY (v_leads)) THEN
    RAISE EXCEPTION 'delete_spam_leads: a lead has quotes, jobs, consent records or invites; not plain spam';
  END IF;

  DELETE FROM notification_log n
   WHERE n.id = ANY (v_alerts)
     AND n.tenant_id = v_hq
     AND n.template_name = 'crm_new_lead'
     AND EXISTS (
       SELECT 1 FROM leads l
        WHERE l.id = ANY (v_leads)
          AND n.created_at >= l.created_at
          AND n.created_at < l.created_at + interval '1 minute'
     );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 3 THEN
    RAISE EXCEPTION 'delete_spam_leads: notification_log changed % rows, expected 0 to 3', v_rows;
  END IF;

  DELETE FROM leads WHERE id = ANY (v_leads) AND tenant_id = v_hq;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 3 THEN
    RAISE EXCEPTION 'delete_spam_leads: leads changed % rows, expected 3', v_rows;
  END IF;
END $$;
