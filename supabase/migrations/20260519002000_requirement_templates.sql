-- Migration 020: Requirement Templates
-- Per-tenant library of class requirements (age, gender, level, document, manual)
-- Config is JSONB - no enum in schema, allows full customization
-- DEPENDENCIES: Migration 001 (tenants table)
-- REQUIRED BY: Phase 1C (classes, enrolments)

CREATE TABLE requirement_templates (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  name                  TEXT        NOT NULL,
  requirement_type      TEXT        NOT NULL,  -- age_range, gender, level, document_submitted, manual_review (catch-all)
  config                JSONB       NOT NULL,  -- Template-specific config: {min_age, max_age, reference_date, doc_type, etc}
  display_text          TEXT,                  -- Human-readable description for UI
  is_hard_block         BOOLEAN     NOT NULL DEFAULT true,  -- true: blocks enrolment, false: flags for admin review
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- Indexes
CREATE INDEX idx_requirement_templates_tenant ON requirement_templates(tenant_id);
CREATE INDEX idx_requirement_templates_type ON requirement_templates(requirement_type);

-- RLS
ALTER TABLE requirement_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all requirement_templates" ON requirement_templates FOR ALL
  USING (is_super_admin());

CREATE POLICY "admins manage requirement_templates" ON requirement_templates FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  );

-- Authenticated users read requirement templates for their own tenant
CREATE POLICY "authenticated read requirement_templates" ON requirement_templates FOR SELECT
  USING (tenant_id = get_my_tenant_id());