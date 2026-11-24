-- =============================================================================
-- Cancel a booked shoot: allow the "shoot cancelled" client email in the
-- automatic email tables. The cancel-job edge function sends it (once per
-- shoot) when the studio ticks "Email the client" in the Cancel shoot dialog.
-- DEPENDENCIES: 20261111075500_review_request_email.sql
-- =============================================================================

ALTER TABLE tenant_automatic_emails
  DROP CONSTRAINT IF EXISTS tenant_automatic_emails_email_key_check;
ALTER TABLE tenant_automatic_emails
  ADD CONSTRAINT tenant_automatic_emails_email_key_check CHECK (email_key IN
    ('quote_sent', 'booking_confirmed', 'shoot_reminder', 'shoot_thank_you', 'gallery_ready',
     'contract_signed_client', 'contract_signed_studio', 'review_request', 'shoot_cancelled'));

ALTER TABLE automatic_email_log
  DROP CONSTRAINT IF EXISTS automatic_email_log_email_key_check;
ALTER TABLE automatic_email_log
  ADD CONSTRAINT automatic_email_log_email_key_check CHECK (email_key IN
    ('quote_sent', 'booking_confirmed', 'shoot_reminder', 'shoot_thank_you', 'gallery_ready',
     'contract_signed_client', 'contract_signed_studio', 'review_request', 'shoot_cancelled'));
