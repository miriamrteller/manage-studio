-- Migration 024: People Add Billing
-- Add billing_account_id to people (nullable, primarily for backwards compat)
-- In Phase 1C, billing moves to enrolments level for flexibility
-- DEPENDENCIES: Migration 002 (people table), Migration 023 (billing_accounts table)
-- REQUIRED BY: Phase 1C (payments, enrolments)

ALTER TABLE people
  ADD COLUMN billing_account_id UUID REFERENCES billing_accounts(id);

-- Index
CREATE INDEX idx_people_billing_account ON people(billing_account_id);

-- Comment
COMMENT ON COLUMN people.billing_account_id IS 'Default billing account for this person. Can be overridden per enrolment. Nullable - some people may pay per class individually.';
