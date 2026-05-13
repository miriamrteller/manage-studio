-- Migration 021: People Add Waivers
-- Link people to waiver templates
-- DEPENDENCIES: Migration 002 (people table has waiver_accepted_at, waiver_version), Migration 019 (waiver_templates table)
-- REQUIRED BY: Phase 1C (enrolment flow, legal compliance)

ALTER TABLE people
  ADD COLUMN waiver_template_id UUID REFERENCES waiver_templates(id);

-- Index for lookup
CREATE INDEX idx_people_waiver_template ON people(waiver_template_id);

-- Comment
COMMENT ON COLUMN people.waiver_template_id IS 'Reference to the active waiver template. Links to waiver_templates(id).';
