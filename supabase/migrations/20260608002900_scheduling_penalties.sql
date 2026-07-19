-- S5: appointment no-show / late-cancellation penalty recording (no PSP capture).

ALTER TABLE tenant_scheduling_settings
  ADD COLUMN IF NOT EXISTS late_cancel_hours INT NOT NULL DEFAULT 24
    CHECK (late_cancel_hours >= 0),
  ADD COLUMN IF NOT EXISTS retain_payment_on_penalty BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS penalty_applied_at TIMESTAMPTZ;

COMMENT ON COLUMN tenant_scheduling_settings.late_cancel_hours IS
  'Hours before booked_starts_at within which admin cancel is treated as late_cancellation';
COMMENT ON COLUMN tenant_scheduling_settings.retain_payment_on_penalty IS
  'When true, paid no-show / late cancel sets penalty_applied_at (payment kept; no auto-refund)';
COMMENT ON COLUMN engagements.penalty_applied_at IS
  'Set when a no-show or late cancellation retains payment as penalty (S5; no PSP charge)';
