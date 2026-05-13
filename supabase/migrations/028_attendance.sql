-- Migration 028: Attendance
-- Track attendance for sessions, makeup credit tracking
-- DEPENDENCIES: Migration 018 (class_sessions), Migration 002 (people)
-- REQUIRED BY: Phase 1C (attendance marking, makeup credits)

CREATE TABLE attendance (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  session_id            UUID        NOT NULL REFERENCES class_sessions(id),
  person_id             UUID        NOT NULL REFERENCES people(id),
  attended              BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, person_id)
);

CREATE TABLE makeup_credits (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  person_id             UUID        NOT NULL REFERENCES people(id),
  class_id              UUID        NOT NULL REFERENCES classes(id),
  credit_type           TEXT        NOT NULL DEFAULT 'makeup'  -- makeup, promotional, other
    CHECK (credit_type IN ('makeup', 'promotional', 'other')),
  sessions_remaining    INT         NOT NULL DEFAULT 1,
  expires_at            TIMESTAMPTZ,  -- NULL: never expires
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_attendance_tenant ON attendance(tenant_id);
CREATE INDEX idx_attendance_session ON attendance(session_id);
CREATE INDEX idx_attendance_person ON attendance(person_id);
CREATE INDEX idx_makeup_credits_tenant ON makeup_credits(tenant_id);
CREATE INDEX idx_makeup_credits_person ON makeup_credits(person_id);
CREATE INDEX idx_makeup_credits_class ON makeup_credits(class_id);

-- RLS
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE makeup_credits ENABLE ROW LEVEL SECURITY;

-- Attendance policies
CREATE POLICY "admins manage attendance" ON attendance FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role @> ARRAY['tenant_admin']));

CREATE POLICY "teachers mark attendance" ON attendance FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role @> ARRAY['teacher']));

CREATE POLICY "families see own attendance" ON attendance FOR SELECT
  USING (person_id IN (SELECT id FROM people WHERE family_id IN (SELECT family_id FROM family_members WHERE user_profile_id = auth.uid())));

CREATE POLICY "adult students see own attendance" ON attendance FOR SELECT
  USING (person_id IN (SELECT id FROM people WHERE user_profile_id = auth.uid()));

-- Makeup credits policies
CREATE POLICY "admins manage makeup_credits" ON makeup_credits FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role @> ARRAY['tenant_admin']));

CREATE POLICY "families see own makeup_credits" ON makeup_credits FOR SELECT
  USING (person_id IN (SELECT id FROM people WHERE family_id IN (SELECT family_id FROM family_members WHERE user_profile_id = auth.uid())));

CREATE POLICY "adult students see own makeup_credits" ON makeup_credits FOR SELECT
  USING (person_id IN (SELECT id FROM people WHERE user_profile_id = auth.uid()));
