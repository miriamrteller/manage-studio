-- Payment dunning foundation (V1 locked architecture).
-- Renewal SSOT remains billing_schedules; enrolment unpaid SSOT uses columns below.

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS payment_dunning_attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_dunning_next_at TIMESTAMPTZ;

COMMENT ON COLUMN engagements.payment_dunning_attempt_count IS
  'Unpaid enrolment dunning ladder (§6.x #8). Zero until pending_payment cron runs. Not used for renewals.';
COMMENT ON COLUMN engagements.payment_dunning_next_at IS
  'Next enrolment payment reminder action time (Jerusalem policy). NULL when inactive.';

-- Idempotency: one successful send per dunning_key (failed rows may retry).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_dunning_key
  ON notification_log (tenant_id, template_name, (variables->>'dunning_key'))
  WHERE (variables->>'dunning_key') IS NOT NULL
    AND status IN ('sent', 'delivered', 'read', 'pending');
