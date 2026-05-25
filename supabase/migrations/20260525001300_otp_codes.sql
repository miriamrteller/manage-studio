-- Migration 013: Temporary OTP storage table
-- Purpose: Store 6-digit OTP codes during verification process
-- Lifecycle: Automatic cleanup of expired codes (TTL-based)
-- Created: 2026-05-12

CREATE TABLE otp_codes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT        NOT NULL,
  code              TEXT        NOT NULL CHECK (code ~ '^\d{6}$'),
  message_id        TEXT        NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  verified          BOOLEAN     NOT NULL DEFAULT false,
  verified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by email and expiry (cleanup queries)
CREATE INDEX idx_otp_codes_email_expires
  ON otp_codes(email, expires_at);

-- Index for cleanup: find expired codes
CREATE INDEX idx_otp_codes_expires
  ON otp_codes(expires_at);

-- Enable RLS before defining policies
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- No authenticated or anon client policies.
-- otp_codes is accessed exclusively by Edge Functions using service_role.
-- Revoke direct client access as belt-and-suspenders.
REVOKE ALL ON otp_codes FROM anon;
REVOKE ALL ON otp_codes FROM authenticated;

-- Function: Clean up expired OTP codes (run daily via pg_cron)
-- After first deploy, schedule with:
-- SELECT cron.schedule('cleanup-expired-otps', '0 1 * * *', 'SELECT cleanup_expired_otps()');
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < now();
END;
$$;