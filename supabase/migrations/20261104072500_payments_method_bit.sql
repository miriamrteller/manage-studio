-- =============================================================================
-- "Record a payment" (cash / bank transfer / Bit) in every flow, PR 1: Bit as
-- a payment method. A studio records a Bit payment it received directly; the
-- app never takes Bit payments itself.
-- =============================================================================

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('card', 'cash', 'bank_transfer', 'bit', 'other'));
