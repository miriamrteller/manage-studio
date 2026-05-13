-- Migration 018: Class Sessions
-- Core table for attendance, scheduling, and session-level data
-- DEPENDENCIES: Migration 004 (classes table must exist)
-- REQUIRED BY: Phase 1C (attendance, enrolments by session)

CREATE TABLE class_sessions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  class_id              UUID        NOT NULL REFERENCES classes(id),
  session_date          DATE        NOT NULL,
  start_time            TIME        NOT NULL,
  end_time              TIME        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sessions_tenant ON class_sessions(tenant_id);
CREATE INDEX idx_sessions_class ON class_sessions(class_id);
CREATE INDEX idx_sessions_date ON class_sessions(session_date);

-- RLS
ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;

-- Policies
-- Admins and teachers manage sessions
CREATE POLICY "admins manage sessions" ON class_sessions FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role @> ARRAY['tenant_admin']));

CREATE POLICY "teachers manage sessions" ON class_sessions FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role @> ARRAY['teacher']));
