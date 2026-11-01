-- =============================================================================
-- Per-studio choice: require two-step sign-in (TOTP) for every admin.
--
-- Off by default. When on, the admin area (MfaChallengeGate) blocks an admin
-- with no verified factor and shows the enrolment screen instead. Super-admins
-- are not affected by a studio's setting. Only a studio admin can change it:
-- the existing "admins update own tenant" policy covers the update.
--
-- Additive only.
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS require_admin_mfa BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.require_admin_mfa IS
  'true = every admin of this studio must set up two-step sign-in before using the admin area.';

-- 002700_grants.sql granted column-level SELECT at that time, so new columns
-- need their own grant. Admins read their own tenant through RLS.
GRANT SELECT (require_admin_mfa) ON TABLE public.tenants TO authenticated;
