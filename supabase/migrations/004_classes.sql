-- Migration 004: Terms, Levels, and Classes
-- Foundational data for class scheduling
-- DEPENDENCIES: Migration 001 must be complete (references tenants)
-- REQUIRED BY: Phase 1C (enrolment, attendance tracking)

CREATE TABLE terms (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  name        TEXT        NOT NULL,
  start_date  DATE        NOT NULL,
  end_date    DATE        NOT NULL,
  is_current  BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_current_term_per_tenant
  ON terms (tenant_id) WHERE (is_current = true);

CREATE TABLE levels (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  name        TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE classes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  term_id               UUID        NOT NULL REFERENCES terms(id),
  level_id              UUID        REFERENCES levels(id),
  name                  TEXT        NOT NULL,
  day_of_week           INT         CHECK (day_of_week BETWEEN 0 AND 6),
  start_time            TIME        NOT NULL,
  end_time              TIME        NOT NULL,
  max_capacity          INT         NOT NULL DEFAULT 15,
  price_minor           INT         NOT NULL DEFAULT 0,
  currency              TEXT        NOT NULL DEFAULT 'ILS',
  vat_rate              NUMERIC(5,4),
  is_public             BOOLEAN     NOT NULL DEFAULT true,
  status                TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'cancelled', 'full')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_terms_tenant ON terms(tenant_id);
CREATE INDEX idx_levels_tenant ON levels(tenant_id);
CREATE INDEX idx_classes_tenant ON classes(tenant_id);
CREATE INDEX idx_classes_term ON classes(term_id);
CREATE INDEX idx_classes_public ON classes(is_public) WHERE is_public = true;

-- RLS
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Policies
-- Terms & Levels: public read, admin write
CREATE POLICY "all see terms" ON terms FOR SELECT USING (true);
CREATE POLICY "admins manage terms" ON terms FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role @> ARRAY['tenant_admin']));

CREATE POLICY "all see levels" ON levels FOR SELECT USING (true);
CREATE POLICY "admins manage levels" ON levels FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role @> ARRAY['tenant_admin']));

-- Classes: public read (is_public), admin write
CREATE POLICY "public read classes" ON classes FOR SELECT
  USING (is_public = true);

CREATE POLICY "admins manage classes" ON classes FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role @> ARRAY['tenant_admin']));
