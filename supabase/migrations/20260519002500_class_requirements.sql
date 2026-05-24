-- Migration 025: Class Requirements
-- Per-class requirements - either from template OR custom config
-- A class can use predefined requirement templates or define custom requirements
-- DEPENDENCIES: Migration 004 (classes table), Migration 020 (requirement_templates table)
-- REQUIRED BY: Phase 1C (enrolments, requirement checking)

CREATE TABLE class_requirements (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  class_id              UUID        NOT NULL REFERENCES classes(id),
  requirement_template_id UUID       REFERENCES requirement_templates(id),  -- NULL if custom config
  config                JSONB,      -- Custom config if not using template. NULL if using template_id
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((requirement_template_id IS NOT NULL AND config IS NULL) OR (requirement_template_id IS NULL AND config IS NOT NULL))
);

-- Partial unique index: only one template per class
CREATE UNIQUE INDEX idx_class_requirements_template_unique ON class_requirements(class_id, requirement_template_id) WHERE requirement_template_id IS NOT NULL;

-- Indexes
CREATE INDEX idx_class_requirements_tenant ON class_requirements(tenant_id);
CREATE INDEX idx_class_requirements_class ON class_requirements(class_id);
CREATE INDEX idx_class_requirements_template ON class_requirements(requirement_template_id);

-- RLS
ALTER TABLE class_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all class_requirements" ON class_requirements FOR ALL
  USING (is_super_admin());

CREATE POLICY "admins manage class_requirements" ON class_requirements FOR ALL
  USING (tenant_id = get_my_tenant_id() AND 'tenant_admin' = ANY(
    (SELECT role FROM user_profiles WHERE id = auth.uid())
  ));

-- Authenticated users read class requirements for their own tenant (needed during enrolment)
CREATE POLICY "authenticated read class_requirements" ON class_requirements FOR SELECT
  USING (tenant_id = get_my_tenant_id());