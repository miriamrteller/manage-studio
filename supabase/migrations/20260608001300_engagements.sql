-- =============================================================================
-- 001300: Engagements + Waitlist
-- Core state machine. All waiver / age-override columns baked in.
-- waiver_evidence_id is a real FK (waiver_evidence created in 001200).
-- DEPENDENCIES: 000200, 000300, 000500, 000800, 001100, 001200
-- =============================================================================

CREATE TABLE engagements (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID        NOT NULL REFERENCES tenants(id),
  person_id              UUID        NOT NULL REFERENCES people(id),
  offering_id            UUID        NOT NULL REFERENCES offerings(id),
  season_id              UUID        REFERENCES seasons(id),
  billing_account_id     UUID        REFERENCES billing_accounts(id),
  waiver_evidence_id     UUID        REFERENCES waiver_evidence(id),
  status                 TEXT        NOT NULL DEFAULT 'pending_payment'
                         CHECK (status IN ('pending_payment', 'active', 'admin_review', 'pending_offer', 'cancelled', 'withdrawn', 'pending_waiver')),
  billing_status         TEXT        CHECK (billing_status IN ('current', 'past_due', 'suspended', 'cancelled')),
  stripe_subscription_id TEXT,
  stripe_customer_id     TEXT,
  payment_received_at    TIMESTAMPTZ,
  cancelled_at           TIMESTAMPTZ,
  cancellation_reason    TEXT,
  cancelled_by           UUID        REFERENCES user_profiles(id),
  -- Age override / parent age-review metadata
  age_override_at        TIMESTAMPTZ,
  age_override_by        UUID        REFERENCES user_profiles(id),
  age_override_reason    TEXT,
  age_review_note        TEXT,
  age_at_season_start    INT         CHECK (age_at_season_start >= 0),
  -- Waiver deadline + reminder tracking (guest pending_waiver flow)
  waiver_deadline        TIMESTAMPTZ,
  waiver_48h_reminded_at TIMESTAMPTZ,
  waiver_5d_reminded_at  TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN engagements.age_override_at     IS 'Set when a tenant admin overrides age eligibility.';
COMMENT ON COLUMN engagements.age_override_by     IS 'Admin user_profiles.id that performed the age override.';
COMMENT ON COLUMN engagements.age_override_reason IS 'Optional note explaining the age override decision.';
COMMENT ON COLUMN engagements.age_review_note     IS 'Optional parent note when requesting age exception review.';
COMMENT ON COLUMN engagements.age_at_season_start IS 'Snapshot age in whole years at season start when engagement was created.';
COMMENT ON COLUMN engagements.waiver_evidence_id  IS 'The exact signed waiver record that covers this enrolment; set at checkout.';

CREATE UNIQUE INDEX idx_engagements_active_with_season ON engagements(person_id, offering_id, season_id)
  WHERE status NOT IN ('cancelled', 'withdrawn') AND season_id IS NOT NULL;

CREATE UNIQUE INDEX idx_engagements_active_no_season ON engagements(person_id, offering_id)
  WHERE status NOT IN ('cancelled', 'withdrawn') AND season_id IS NULL;

CREATE INDEX idx_engagements_tenant          ON engagements(tenant_id);
CREATE INDEX idx_engagements_person          ON engagements(person_id);
CREATE INDEX idx_engagements_offering        ON engagements(offering_id);
CREATE INDEX idx_engagements_season          ON engagements(season_id);
CREATE INDEX idx_engagements_status          ON engagements(status);
CREATE INDEX idx_engagements_waiver_evidence ON engagements(waiver_evidence_id);

ALTER TABLE engagements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all engagements"    ON engagements FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage engagements"              ON engagements FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "account holders see own engagements"    ON engagements FOR SELECT USING (person_id IN (SELECT id FROM people WHERE account_id IN (SELECT get_my_account_ids())));
CREATE POLICY "adult students see own engagements"     ON engagements FOR SELECT USING (person_id = get_my_person_id());
CREATE POLICY "account holders create child engagements"
  ON engagements FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND status = 'pending_payment'
    AND person_id IN (
      SELECT id FROM people
      WHERE tenant_id = get_my_tenant_id()
        AND account_id IN (SELECT get_my_account_ids())
    )
  );
CREATE POLICY "adult students create own engagements"
  ON engagements FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND status = 'pending_payment'
    AND person_id = get_my_person_id()
  );

CREATE TABLE waitlist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  offering_id UUID        NOT NULL REFERENCES offerings(id),
  person_id   UUID        NOT NULL REFERENCES people(id),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offering_id, person_id)
);

CREATE INDEX idx_waitlist_tenant   ON waitlist(tenant_id);
CREATE INDEX idx_waitlist_offering ON waitlist(offering_id);
CREATE INDEX idx_waitlist_person   ON waitlist(person_id);
CREATE INDEX idx_waitlist_position ON waitlist(offering_id, added_at);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages all waitlist" ON waitlist FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage waitlist"           ON waitlist FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "people see own waitlist"          ON waitlist FOR SELECT USING (person_id = get_my_person_id() OR person_id IN (SELECT id FROM people WHERE account_id IN (SELECT get_my_account_ids())));
