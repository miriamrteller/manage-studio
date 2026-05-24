-- Migration 015: Verification Attempts
-- Purpose: Rate limiting for OTP verification attempts
-- Enforces: Max 5 attempts per contact_point/channel/tenant per hour
-- Features: Atomic UPSERT, automatic cleanup, soft blocking
-- DEPENDENCIES: Migration 001 (tenants, is_service_role, is_super_admin)

CREATE TABLE verification_attempts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_point     TEXT        NOT NULL,
  channel           TEXT        NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  attempt_count     INT         NOT NULL DEFAULT 1,
  last_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, contact_point, channel)
);

-- Indexes for common queries
CREATE INDEX idx_verification_attempts_lookup
  ON verification_attempts (tenant_id, contact_point, channel);

CREATE INDEX idx_verification_attempts_blocked
  ON verification_attempts (tenant_id, blocked_until) WHERE blocked_until IS NOT NULL;

-- Enable RLS
ALTER TABLE verification_attempts ENABLE ROW LEVEL SECURITY;

-- Super-admin reads all (platform monitoring)
CREATE POLICY "super_admin_reads_all_attempts" ON verification_attempts FOR SELECT
  USING (is_super_admin());

-- Tenant admins read/manage attempts in their own tenant
CREATE POLICY "admin_manage_attempts" ON verification_attempts FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND 'tenant_admin' = ANY((SELECT role FROM user_profiles WHERE id = auth.uid()))
  );

-- Edge Functions (service_role) insert new records
CREATE POLICY "system_insert_attempts" ON verification_attempts FOR INSERT
  WITH CHECK (is_service_role());

-- Edge Functions (service_role) update existing records
CREATE POLICY "system_update_attempts" ON verification_attempts FOR UPDATE
  USING (is_service_role())
  WITH CHECK (is_service_role());

-- Function: Update attempt count + set blocked_until if threshold exceeded.
-- ATOMIC via ON CONFLICT — prevents race conditions from concurrent requests.
CREATE OR REPLACE FUNCTION increment_verification_attempt(
  p_tenant_id UUID,
  p_contact_point TEXT,
  p_channel TEXT
)
RETURNS TABLE (
  attempt_count INT,
  blocked_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_count INT;
  v_blocked_until TIMESTAMPTZ;
BEGIN
  INSERT INTO verification_attempts (tenant_id, contact_point, channel, attempt_count, last_attempt_at)
  VALUES (p_tenant_id, p_contact_point, p_channel, 1, now())
  ON CONFLICT (tenant_id, contact_point, channel)
  DO UPDATE SET
    attempt_count = CASE
      WHEN EXTRACT(EPOCH FROM now() - verification_attempts.last_attempt_at) > 3600 THEN 1
      ELSE verification_attempts.attempt_count + 1
    END,
    last_attempt_at = now(),
    blocked_until = CASE
      WHEN (
        CASE
          WHEN EXTRACT(EPOCH FROM now() - verification_attempts.last_attempt_at) > 3600 THEN 1
          ELSE verification_attempts.attempt_count + 1
        END
      ) >= 5 THEN now() + INTERVAL '1 hour'
      WHEN EXTRACT(EPOCH FROM now() - verification_attempts.last_attempt_at) > 3600 THEN NULL
      ELSE verification_attempts.blocked_until
    END,
    updated_at = now()
  RETURNING verification_attempts.attempt_count, verification_attempts.blocked_until INTO v_attempt_count, v_blocked_until;

  RETURN QUERY SELECT v_attempt_count, v_blocked_until;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_verification_attempt(UUID, TEXT, TEXT) TO service_role;

-- Function: Remove attempts older than 30 days
-- After first deploy, schedule with pg_cron:
-- SELECT cron.schedule('cleanup-verification-attempts', '0 2 * * *', 'SELECT cleanup_old_verification_attempts()');
CREATE OR REPLACE FUNCTION cleanup_old_verification_attempts()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM verification_attempts
  WHERE created_at < now() - INTERVAL '30 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_old_verification_attempts() TO service_role;
