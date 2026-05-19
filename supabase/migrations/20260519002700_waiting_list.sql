-- Migration 027: Waiting List
-- Auto-managed class queue, position computed via ROW_NUMBER()
-- DEPENDENCIES: Migration 002 (people), Migration 004 (classes), Migration 026 (enrolments)
-- REQUIRED BY: Phase 1C (waitlist management, auto-promotion)

CREATE TABLE waiting_list (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  class_id              UUID        NOT NULL REFERENCES classes(id),
  person_id             UUID        NOT NULL REFERENCES people(id),
  added_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, person_id)
);

-- Indexes
CREATE INDEX idx_waiting_list_tenant ON waiting_list(tenant_id);
CREATE INDEX idx_waiting_list_class ON waiting_list(class_id);
CREATE INDEX idx_waiting_list_person ON waiting_list(person_id);
CREATE INDEX idx_waiting_list_position ON waiting_list(class_id, added_at);

-- RLS
ALTER TABLE waiting_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage waiting_list" ON waiting_list FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role @> ARRAY['tenant_admin']));

CREATE POLICY "people see own waiting_list" ON waiting_list FOR SELECT
  USING (person_id IN (SELECT id FROM people WHERE user_profile_id = auth.uid())
         OR
         person_id IN (SELECT id FROM people WHERE family_id IN (SELECT family_id FROM family_members WHERE user_profile_id = auth.uid())));