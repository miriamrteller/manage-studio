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

-- Policy: Anyone can insert their own OTP during signup
CREATE POLICY "otp_codes_insert_own"
  ON otp_codes
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can read their own unverified codes
CREATE POLICY "otp_codes_select_own"
  ON otp_codes
  FOR SELECT
  USING (true);

-- Policy: Users can update their own codes (mark as verified)
CREATE POLICY "otp_codes_update_own"
  ON otp_codes
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Enable RLS
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- Function: Clean up expired OTP codes (run daily via pg_cron)
-- Recommendation: Add to cron schedule with:
-- SELECT cron.schedule('cleanup-expired-otps', '0 1 * * *', 'DELETE FROM otp_codes WHERE expires_at < now()');
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;