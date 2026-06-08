-- =============================================================================
-- 001400: Attendance + Service Credits
-- DEPENDENCIES: 000200, 000300, 000500, 000800, 001300
-- =============================================================================

CREATE TABLE attendance (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id),
  session_id UUID        NOT NULL REFERENCES offering_sessions(id),
  person_id  UUID        NOT NULL REFERENCES people(id),
  attended   BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, person_id)
);

CREATE TABLE service_credits (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id),
  person_id          UUID        NOT NULL REFERENCES people(id),
  offering_id        UUID        NOT NULL REFERENCES offerings(id),
  credit_type        TEXT        NOT NULL DEFAULT 'makeup'
                     CHECK (credit_type IN ('makeup', 'promotional', 'other')),
  sessions_remaining INT         NOT NULL DEFAULT 1,
  expires_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendance_tenant        ON attendance(tenant_id);
CREATE INDEX idx_attendance_session       ON attendance(session_id);
CREATE INDEX idx_attendance_person        ON attendance(person_id);
CREATE INDEX idx_service_credits_tenant   ON service_credits(tenant_id);
CREATE INDEX idx_service_credits_person   ON service_credits(person_id);
CREATE INDEX idx_service_credits_offering ON service_credits(offering_id);

ALTER TABLE attendance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all attendance" ON attendance FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage attendance"           ON attendance FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "staff mark attendance"              ON attendance FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'staff' = ANY(role)));
CREATE POLICY "accounts see own attendance"        ON attendance FOR SELECT USING (person_id IN (SELECT id FROM people WHERE account_id IN (SELECT get_my_account_ids())));
CREATE POLICY "adult students see own attendance"  ON attendance FOR SELECT USING (person_id = get_my_person_id());

CREATE POLICY "super_admin manages all service_credits" ON service_credits FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage service_credits"           ON service_credits FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "accounts see own service_credits"        ON service_credits FOR SELECT USING (person_id IN (SELECT id FROM people WHERE account_id IN (SELECT get_my_account_ids())));
CREATE POLICY "adult students see own service_credits"  ON service_credits FOR SELECT USING (person_id = get_my_person_id());
