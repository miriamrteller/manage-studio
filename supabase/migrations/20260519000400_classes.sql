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
  status      TEXT        NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_active_term_per_tenant
  ON terms (tenant_id) WHERE (status = 'active');

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
  billing_frequency     VARCHAR(50) DEFAULT 'monthly' NOT NULL,
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

CREATE INDEX idx_classes_billing_frequency ON classes(billing_frequency);

-- RLS
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Policies
-- Terms & Levels: authenticated users see own tenant; super_admin sees all; admin writes
-- anon access is via get_public_classes_by_subdomain() RPC — not direct table reads
CREATE POLICY "super_admin manages all terms" ON terms FOR ALL
  USING (is_super_admin());

CREATE POLICY "authenticated see own terms" ON terms FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "admins manage terms" ON terms FOR ALL
  USING (tenant_id = get_my_tenant_id() AND 'tenant_admin' = ANY(
    (SELECT role FROM user_profiles WHERE id = auth.uid())
  ));

CREATE POLICY "super_admin manages all levels" ON levels FOR ALL
  USING (is_super_admin());

CREATE POLICY "authenticated see own levels" ON levels FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "admins manage levels" ON levels FOR ALL
  USING (tenant_id = get_my_tenant_id() AND 'tenant_admin' = ANY(
    (SELECT role FROM user_profiles WHERE id = auth.uid())
  ));

-- Classes: authenticated users see own tenant's classes; super_admin sees all; admin/teacher write
-- anon public-facing class catalog is served by get_public_classes_by_subdomain() RPC
CREATE POLICY "super_admin manages all classes" ON classes FOR ALL
  USING (is_super_admin());

CREATE POLICY "authenticated see own classes" ON classes FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "admins manage classes" ON classes FOR ALL
  USING (tenant_id = get_my_tenant_id() AND 'tenant_admin' = ANY(
    (SELECT role FROM user_profiles WHERE id = auth.uid())
  ));