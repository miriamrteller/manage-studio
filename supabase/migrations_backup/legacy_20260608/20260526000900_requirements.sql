-- =============================================================================
-- 009: Requirement Templates + Overrides + Offering Requirements
-- age_range is NOT a valid requirement_type — age is a direct column on offerings.
-- Valid types: gender, level, document_submitted, manual_review
-- DEPENDENCIES: 001, 002, 004
-- =============================================================================

CREATE TABLE requirement_templates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  name             TEXT        NOT NULL,
  requirement_type TEXT        NOT NULL
                   CHECK (requirement_type IN ('gender', 'level', 'document_submitted', 'manual_review')),
  config           JSONB       NOT NULL,
  display_text     TEXT,
  is_hard_block    BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_requirement_templates_tenant ON requirement_templates(tenant_id);
CREATE INDEX idx_requirement_templates_type   ON requirement_templates(requirement_type);

ALTER TABLE requirement_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all requirement_templates"  ON requirement_templates FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage requirement_templates"            ON requirement_templates FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "authenticated read requirement_templates"       ON requirement_templates FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE TABLE requirement_overrides (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES tenants(id),
  person_id               UUID        NOT NULL REFERENCES people(id),
  requirement_template_id UUID        NOT NULL REFERENCES requirement_templates(id),
  status                  TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'denied', 'offered_alternative')),
  request_reason          TEXT,
  admin_notes             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_overrides_pending_unique ON requirement_overrides(person_id, requirement_template_id) WHERE status = 'pending';
CREATE INDEX idx_overrides_tenant ON requirement_overrides(tenant_id);
CREATE INDEX idx_overrides_person ON requirement_overrides(person_id);
CREATE INDEX idx_overrides_status ON requirement_overrides(status);

ALTER TABLE requirement_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all requirement_overrides"  ON requirement_overrides FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage requirement_overrides"            ON requirement_overrides FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "account holders see own overrides"                      ON requirement_overrides FOR SELECT USING (person_id IN (SELECT id FROM people WHERE account_id IN (SELECT get_my_account_ids())));
CREATE POLICY "adult students see own overrides"               ON requirement_overrides FOR SELECT USING (person_id = get_my_person_id());

CREATE TABLE offering_requirements (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES tenants(id),
  offering_id             UUID        NOT NULL REFERENCES offerings(id),
  requirement_template_id UUID        REFERENCES requirement_templates(id),
  config                  JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (requirement_template_id IS NOT NULL AND config IS NULL) OR
    (requirement_template_id IS NULL     AND config IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_offering_requirements_template_unique ON offering_requirements(offering_id, requirement_template_id) WHERE requirement_template_id IS NOT NULL;
CREATE INDEX idx_offering_requirements_tenant   ON offering_requirements(tenant_id);
CREATE INDEX idx_offering_requirements_offering ON offering_requirements(offering_id);
CREATE INDEX idx_offering_requirements_template ON offering_requirements(requirement_template_id);

ALTER TABLE offering_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all offering_requirements"  ON offering_requirements FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage offering_requirements"            ON offering_requirements FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "authenticated read offering_requirements"       ON offering_requirements FOR SELECT USING (tenant_id = get_my_tenant_id());
