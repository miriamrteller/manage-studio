-- Migration 022: Requirement Overrides
-- Soft-block approval workflow for when requirements can't be auto-checked
-- Parent can request override, admin approves/denies/offers alternative
-- DEPENDENCIES: Migration 002 (people table), Migration 020 (requirement_templates table)
-- REQUIRED BY: Phase 1C (enrolment flow, flexible requirements)

CREATE TABLE requirement_overrides (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  person_id             UUID        NOT NULL REFERENCES people(id),
  requirement_template_id UUID       NOT NULL REFERENCES requirement_templates(id),
  status                TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'offered_alternative')),
  request_reason        TEXT,  -- Why parent is requesting override
  admin_notes           TEXT,  -- Admin decision notes
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index: only one pending request per person/requirement
CREATE UNIQUE INDEX idx_overrides_pending_unique ON requirement_overrides(person_id, requirement_template_id) WHERE status = 'pending';

-- Indexes
CREATE INDEX idx_overrides_tenant ON requirement_overrides(tenant_id);
CREATE INDEX idx_overrides_person ON requirement_overrides(person_id);
CREATE INDEX idx_overrides_status ON requirement_overrides(status);

-- RLS
ALTER TABLE requirement_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all requirement_overrides" ON requirement_overrides FOR ALL
  USING (is_super_admin());

CREATE POLICY "admins manage requirement_overrides" ON requirement_overrides FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY "parents see own overrides" ON requirement_overrides FOR SELECT
  USING (person_id IN (
    SELECT id FROM people WHERE family_id IN (SELECT get_my_family_ids())
  ));

CREATE POLICY "adult students see own overrides" ON requirement_overrides FOR SELECT
  USING (person_id = get_my_person_id());