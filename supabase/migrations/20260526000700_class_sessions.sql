-- =============================================================================
-- 007: Class Sessions
-- Concrete session instances for attendance and scheduling
-- DEPENDENCIES: 001, 004
-- Additional enrolment-based RLS policies added in 013
-- =============================================================================

CREATE TABLE class_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id),
  class_id     UUID        NOT NULL REFERENCES classes(id),
  session_date DATE        NOT NULL,
  start_time   TIME        NOT NULL,
  end_time     TIME        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_tenant ON class_sessions(tenant_id);
CREATE INDEX idx_sessions_class  ON class_sessions(class_id);
CREATE INDEX idx_sessions_date   ON class_sessions(session_date);

ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all sessions" ON class_sessions FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage sessions"           ON class_sessions FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "teachers manage sessions"         ON class_sessions FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'teacher' = ANY(role)));
