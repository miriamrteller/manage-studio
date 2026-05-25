-- Migration: Teachers table + teacher_id FK on classes
-- DEPENDENCIES: Migration 001 (user_profiles), Migration 004 (classes)

CREATE TABLE teachers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id),
  user_profile_id   UUID        REFERENCES user_profiles(id),
  name              TEXT        NOT NULL,
  email             TEXT,
  phone             TEXT,
  contract_type     TEXT        NOT NULL DEFAULT 'contractor'
                    CHECK (contract_type IN ('employee', 'contractor')),
  hourly_rate_minor INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_teachers_tenant ON teachers(tenant_id);
CREATE INDEX idx_teachers_user_profile ON teachers(user_profile_id);

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all teachers" ON teachers FOR ALL
  USING (is_super_admin());

CREATE POLICY "admins manage teachers" ON teachers FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY "authenticated see own tenant teachers" ON teachers FOR SELECT
  USING (tenant_id = get_my_tenant_id());

-- Add teacher_id FK to classes
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES teachers(id);

CREATE INDEX idx_classes_teacher ON classes(teacher_id);
