-- =============================================================================
-- Leads: campaign tag (docs/plans/LEADS.md P1-B)
--
-- The public enquiry form (/inquire and the embeddable /embed/inquire) accepts
-- ?campaign= (or ?utm_campaign=). crm-lead-capture stores it on NEW leads, so a
-- studio sees which campaign brought a lead. The source stays in `channel`.
-- Consent is recorded separately (consent_records); a campaign tag never
-- implies marketing consent.
--
-- ADDITIVE: one nullable column, no backfill.
-- =============================================================================

ALTER TABLE leads
  ADD COLUMN campaign TEXT
  CHECK (campaign IS NULL OR (char_length(campaign) BETWEEN 1 AND 100));

COMMENT ON COLUMN leads.campaign IS
  'Campaign tag from the enquiry link (?campaign= / ?utm_campaign=), set when the lead is created. Never implies marketing consent.';
