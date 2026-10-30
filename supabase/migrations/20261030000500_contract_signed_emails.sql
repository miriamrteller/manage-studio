-- =============================================================================
-- 000500: Signed-contract emails (photographer Thread G)
--
-- When a client signs a shoot contract, accept-waiver emails the signed PDF to
-- the client and to the photographer. Both sends go through the existing
-- claim_automatic_email / complete_automatic_email ledger so a retry or a
-- double submit never sends twice. The ledger's email_key CHECKs only knew the
-- five scheduled emails; this adds the two contract keys.
--
-- They are deliberately absent from the admin "automatic emails" toggles: a
-- copy of a signed contract is not optional. is_automatic_email_enabled()
-- returns true for keys without a tenant_automatic_emails row.
-- DEPENDENCIES: 20261030000300_quotes.sql
-- =============================================================================

ALTER TABLE tenant_automatic_emails
  DROP CONSTRAINT IF EXISTS tenant_automatic_emails_email_key_check;
ALTER TABLE tenant_automatic_emails
  ADD CONSTRAINT tenant_automatic_emails_email_key_check CHECK (email_key IN
    ('quote_sent', 'booking_confirmed', 'shoot_reminder', 'shoot_thank_you', 'gallery_ready',
     'contract_signed_client', 'contract_signed_studio'));

ALTER TABLE automatic_email_log
  DROP CONSTRAINT IF EXISTS automatic_email_log_email_key_check;
ALTER TABLE automatic_email_log
  ADD CONSTRAINT automatic_email_log_email_key_check CHECK (email_key IN
    ('quote_sent', 'booking_confirmed', 'shoot_reminder', 'shoot_thank_you', 'gallery_ready',
     'contract_signed_client', 'contract_signed_studio'));

COMMENT ON TABLE automatic_email_log IS
  'One row per (email_key, quote|engagement): the at-most-once ledger for automatic emails, including the signed-contract copies (contract_signed_client / contract_signed_studio, keyed by engagement).';
