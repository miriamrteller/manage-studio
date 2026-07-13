-- ============================================================
-- Migration: add b2b_flag to bookings
-- Task: DL-TRZ-002 R-02
-- Additive only — no refactor, no squash.
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS b2b_flag boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN bookings.b2b_flag IS
  'Derived from client.type: true when client is a business entity. '
  'Used by TranzilaInvoicingAdapter to set b2b document type. '
  'Never computed from invoice amount — Tax Delegation Doctrine.';
