-- =============================================================================
-- Grow refunds need Grow's own transaction id (payments audit follow-up).
-- payments.provider_payment_ref holds OUR reference for a Grow charge (the
-- transactionUniqueIdentifier we send), which Grow does not accept on
-- refundTransaction. The notice handler now stores Grow's transactionId here
-- when it settles a payment, and refunds send it. Older Grow payments have no
-- value: the admin refunds them in the Grow dashboard and records the refund.
-- =============================================================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT;

COMMENT ON COLUMN payments.provider_transaction_id IS
  'The provider''s own transaction id, when it differs from provider_payment_ref (Grow: '
  'transactionId from the payment notice). Used for refunds.';
