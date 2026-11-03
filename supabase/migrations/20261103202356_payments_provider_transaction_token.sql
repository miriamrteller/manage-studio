-- =============================================================================
-- Grow refunds need the transaction token too (Grow refundTransaction docs:
-- transactionId, transactionToken and refundSum are all required). The notice
-- handler now stores Grow's transactionToken alongside provider_transaction_id
-- when it settles a payment. Older Grow payments have none: the admin refunds
-- them in the Grow dashboard and records the refund (as for a missing id).
-- =============================================================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_transaction_token TEXT;

COMMENT ON COLUMN payments.provider_transaction_token IS
  'The provider''s transaction token from the payment notice (Grow: transactionToken). '
  'Used with provider_transaction_id for refunds.';
