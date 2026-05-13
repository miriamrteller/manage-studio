-- Migration 026: Enrolments
-- Core table: link people to classes with full state machine
-- State transitions: pending_payment → active / admin_review / pending_offer / cancelled / withdrawn
-- DEPENDENCIES: Migration 002 (people), Migration 004 (classes), Migration 018 (class_sessions), Migration 023 (billing_accounts)
-- REQUIRED BY: Phase 1C (payments, attendance, waiting list)

CREATE TABLE enrolments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  person_id             UUID        NOT NULL REFERENCES people(id),
  class_id              UUID        NOT NULL REFERENCES classes(id),
  term_id               UUID        NOT NULL REFERENCES terms(id),
  billing_account_id    UUID        REFERENCES billing_accounts(id),  -- Can override person.billing_account_id per term
  status                TEXT        NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'active', 'admin_review', 'pending_offer', 'cancelled', 'withdrawn')),
  payment_received_at   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index: only one active enrolment per person/class/term (allows re-enrolment after cancelled/withdrawn)
CREATE UNIQUE INDEX idx_enrolments_active_unique ON enrolments(person_id, class_id, term_id) WHERE status NOT IN ('cancelled', 'withdrawn');

-- Indexes
CREATE INDEX idx_enrolments_tenant ON enrolments(tenant_id);
CREATE INDEX idx_enrolments_person ON enrolments(person_id);
CREATE INDEX idx_enrolments_class ON enrolments(class_id);
CREATE INDEX idx_enrolments_term ON enrolments(term_id);
CREATE INDEX idx_enrolments_status ON enrolments(status);

-- RLS
ALTER TABLE enrolments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage enrolments" ON enrolments FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role @> ARRAY['tenant_admin']));

CREATE POLICY "parents see own enrolments" ON enrolments FOR SELECT
  USING (person_id IN (SELECT id FROM people WHERE family_id IN (SELECT family_id FROM family_members WHERE user_profile_id = auth.uid())));

CREATE POLICY "adult students see own enrolments" ON enrolments FOR SELECT
  USING (person_id IN (SELECT id FROM people WHERE user_profile_id = auth.uid()));
