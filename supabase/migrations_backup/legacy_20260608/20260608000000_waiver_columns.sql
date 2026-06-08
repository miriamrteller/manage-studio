-- =============================================================================
-- Waiver columns on existing tables
-- Adds columns that were written into base migrations (which are already applied
-- on remote and cannot be re-run). This migration is idempotent via IF NOT EXISTS
-- and IF EXISTS guards.
-- =============================================================================

-- tenants: opt-in OTP verification for waiver signing
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS waiver_require_otp BOOLEAN NOT NULL DEFAULT false;

-- offerings: per-class waiver requirement flag (default true for safety;
-- admin can disable per-class once a template exists or if class is low-risk)
ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS waiver_required BOOLEAN NOT NULL DEFAULT true;

-- engagements: new status for paid-but-unsigned-waiver state
-- Drop the existing inline CHECK constraint (auto-named engagements_status_check)
-- and replace it with one that includes 'pending_waiver'.
ALTER TABLE engagements
  DROP CONSTRAINT IF EXISTS engagements_status_check;

ALTER TABLE engagements
  ADD CONSTRAINT engagements_status_check
  CHECK (status IN ('pending_payment', 'active', 'admin_review', 'pending_offer', 'cancelled', 'withdrawn', 'pending_waiver'));
