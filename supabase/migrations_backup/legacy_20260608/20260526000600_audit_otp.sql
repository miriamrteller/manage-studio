-- =============================================================================
-- 006: Audit Log + OTP Codes + Verification Attempts
-- DEPENDENCIES: 001
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Audit log (immutable compliance trail — insert-only by policy)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id),
  actor_id     UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  actor_email  TEXT,
  action       TEXT        NOT NULL,
  entity_type  TEXT        NOT NULL,
  entity_id    UUID,
  before_state JSONB,
  after_state  JSONB,
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_actor  ON audit_log(actor_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_insert          ON audit_log FOR INSERT WITH CHECK (is_service_role() OR tenant_id = get_my_tenant_id());
CREATE POLICY audit_log_super_admin_read ON audit_log FOR SELECT USING (is_super_admin());
CREATE POLICY audit_log_admin_read       ON audit_log FOR SELECT USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

-- ---------------------------------------------------------------------------
-- OTP codes (service_role only — no client access)
-- ---------------------------------------------------------------------------
CREATE TABLE otp_codes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL,
  code        TEXT        NOT NULL CHECK (code ~ '^\d{6}$'),
  message_id  TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  verified    BOOLEAN     NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_otp_codes_email_expires ON otp_codes(email, expires_at);
CREATE INDEX idx_otp_codes_expires       ON otp_codes(expires_at);

ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON otp_codes FROM anon;
REVOKE ALL ON otp_codes FROM authenticated;

-- Schedule after deploy: SELECT cron.schedule('cleanup-expired-otps', '0 1 * * *', 'SELECT cleanup_expired_otps()');
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < now();
END;
$$;

-- ---------------------------------------------------------------------------
-- Verification attempts (OTP rate limiting — 5 attempts/hour per contact)
-- ---------------------------------------------------------------------------
CREATE TABLE verification_attempts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_point   TEXT        NOT NULL,
  channel         TEXT        NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  attempt_count   INT         NOT NULL DEFAULT 1,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, contact_point, channel)
);

CREATE INDEX idx_verification_attempts_lookup  ON verification_attempts(tenant_id, contact_point, channel);
CREATE INDEX idx_verification_attempts_blocked ON verification_attempts(tenant_id, blocked_until) WHERE blocked_until IS NOT NULL;

ALTER TABLE verification_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_reads_all_attempts" ON verification_attempts FOR SELECT USING (is_super_admin());
CREATE POLICY "admin_manage_attempts"          ON verification_attempts FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "system_insert_attempts"         ON verification_attempts FOR INSERT WITH CHECK (is_service_role());
CREATE POLICY "system_update_attempts"         ON verification_attempts FOR UPDATE USING (is_service_role()) WITH CHECK (is_service_role());

CREATE OR REPLACE FUNCTION increment_verification_attempt(
  p_tenant_id   UUID,
  p_contact_point TEXT,
  p_channel     TEXT
)
RETURNS TABLE (attempt_count INT, blocked_until TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  RETURNING verification_attempts.attempt_count, verification_attempts.blocked_until
    INTO v_attempt_count, v_blocked_until;

  RETURN QUERY SELECT v_attempt_count, v_blocked_until;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_verification_attempt(UUID, TEXT, TEXT) TO service_role;

-- Schedule after deploy: SELECT cron.schedule('cleanup-verification-attempts', '0 2 * * *', 'SELECT cleanup_old_verification_attempts()');
CREATE OR REPLACE FUNCTION cleanup_old_verification_attempts()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM verification_attempts WHERE created_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_old_verification_attempts() TO service_role;
