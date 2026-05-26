-- =============================================================================
-- 011: Enrolments + Waiting List
-- Core state machine: pending_payment → active / admin_review / pending_offer / cancelled / withdrawn
-- prior_experience removed (never used)
-- DEPENDENCIES: 001, 002, 004, 007, 010
-- =============================================================================

CREATE TABLE enrolments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id),
  person_id          UUID        NOT NULL REFERENCES people(id),
  class_id           UUID        NOT NULL REFERENCES classes(id),
  term_id            UUID        NOT NULL REFERENCES terms(id),
  billing_account_id UUID        REFERENCES billing_accounts(id),
  status             TEXT        NOT NULL DEFAULT 'pending_payment'
                     CHECK (status IN ('pending_payment', 'active', 'admin_review', 'pending_offer', 'cancelled', 'withdrawn')),
  payment_received_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one non-cancelled/withdrawn enrolment per person/class/term (allows re-enrolment)
CREATE UNIQUE INDEX idx_enrolments_active_unique ON enrolments(person_id, class_id, term_id)
  WHERE status NOT IN ('cancelled', 'withdrawn');

CREATE INDEX idx_enrolments_tenant ON enrolments(tenant_id);
CREATE INDEX idx_enrolments_person ON enrolments(person_id);
CREATE INDEX idx_enrolments_class  ON enrolments(class_id);
CREATE INDEX idx_enrolments_term   ON enrolments(term_id);
CREATE INDEX idx_enrolments_status ON enrolments(status);

ALTER TABLE enrolments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all enrolments"   ON enrolments FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage enrolments"             ON enrolments FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "parents see own enrolments"           ON enrolments FOR SELECT USING (person_id IN (SELECT id FROM people WHERE family_id IN (SELECT get_my_family_ids())));
CREATE POLICY "adult students see own enrolments"    ON enrolments FOR SELECT USING (person_id = get_my_person_id());

-- ---------------------------------------------------------------------------
-- Waiting List (auto-managed queue)
-- ---------------------------------------------------------------------------
CREATE TABLE waiting_list (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID        NOT NULL REFERENCES tenants(id),
  class_id  UUID        NOT NULL REFERENCES classes(id),
  person_id UUID        NOT NULL REFERENCES people(id),
  added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, person_id)
);

CREATE INDEX idx_waiting_list_tenant   ON waiting_list(tenant_id);
CREATE INDEX idx_waiting_list_class    ON waiting_list(class_id);
CREATE INDEX idx_waiting_list_person   ON waiting_list(person_id);
CREATE INDEX idx_waiting_list_position ON waiting_list(class_id, added_at);

ALTER TABLE waiting_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all waiting_list"  ON waiting_list FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage waiting_list"            ON waiting_list FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "people see own waiting_list"           ON waiting_list FOR SELECT USING (person_id = get_my_person_id() OR person_id IN (SELECT id FROM people WHERE family_id IN (SELECT get_my_family_ids())));
