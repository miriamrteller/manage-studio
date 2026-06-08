-- =============================================================================
-- 000800: Offering Sessions
-- Concrete session instances for attendance and scheduling.
-- Engagement-dependent RLS policies are added later in 001500_engagement_rls.
-- DEPENDENCIES: 000200, 000500
-- =============================================================================

CREATE TABLE offering_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id),
  offering_id  UUID        NOT NULL REFERENCES offerings(id),
  session_date DATE        NOT NULL,
  start_time   TIME        NOT NULL,
  end_time     TIME        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_tenant   ON offering_sessions(tenant_id);
CREATE INDEX idx_sessions_offering ON offering_sessions(offering_id);
CREATE INDEX idx_sessions_date     ON offering_sessions(session_date);

ALTER TABLE offering_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all sessions" ON offering_sessions FOR ALL USING (is_super_admin());
CREATE POLICY "admins manage sessions"           ON offering_sessions FOR ALL USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "staff manage sessions"            ON offering_sessions FOR ALL USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'staff' = ANY(role)));
