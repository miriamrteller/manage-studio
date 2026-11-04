-- =============================================================================
-- Record a payment: Bit / PayBox where the studio's invoicing can't receipt it
-- (owner decision 2026-11-04).
--
-- Grow, iCount and Invoice4U issue documents only with their own card charges,
-- so a Bit / PayBox payment recorded in OpalSwift gets no receipt from them.
-- For those studios the option is hidden unless the studio switches this on in
-- Settings ("you'll issue the receipt yourself"). Studios whose invoicing can
-- issue it (YPay, Green Invoice) or that issue no documents see it always.
-- The app reads this only to show the option; recording never refuses it.
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS accept_unreceipted_bit BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.accept_unreceipted_bit IS
  'Show "Bit / PayBox" in Record a payment even though the studio''s invoicing (Grow, iCount, Invoice4U) cannot issue its receipt; the studio issues it itself.';

-- tenants SELECT is granted per column: signed-in users (through the existing RLS) may read it.
GRANT SELECT (accept_unreceipted_bit) ON TABLE public.tenants TO authenticated;
