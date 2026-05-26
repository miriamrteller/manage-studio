-- =============================================================================
-- 004: Terms, Levels, Teachers, Classes
-- teachers created here so classes.teacher_id FK works in the same migration.
-- min_age / max_age are first-class typed columns on classes (not JSONB).
-- DEPENDENCIES: 001
-- =============================================================================

CREATE TABLE terms (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id),
  name       TEXT        NOT NULL,
  start_date DATE        NOT NULL,
  end_date   DATE        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'upcoming'
             CHECK (status IN ('upcoming', 'active', 'completed', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_active_term_per_tenant ON terms(tenant_id) WHERE (status = 'active');

CREATE TABLE levels (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id),
  name       TEXT        NOT NULL,
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Teachers must exist before classes references teacher_id
CREATE TABLE teachers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  user_profile_id  UUID        REFERENCES user_profiles(id),
  name             TEXT        NOT NULL,
  email            TEXT,
  phone            TEXT,
  contract_type    TEXT        DEFAULT 'hourly'
                   CHECK (contract_type IN ('hourly', 'salary', 'freelance')),
  hourly_rate_minor INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE classes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id),
  term_id           UUID        NOT NULL REFERENCES terms(id),
  level_id          UUID        REFERENCES levels(id),
  teacher_id        UUID        REFERENCES teachers(id),
  name              TEXT        NOT NULL,
  day_of_week       INT         CHECK (day_of_week BETWEEN 0 AND 6),
  start_time        TIME        NOT NULL,
  end_time          TIME        NOT NULL,
  max_capacity      INT         NOT NULL DEFAULT 15,
  -- Age range: typed columns, indexed, no JSONB casting
  min_age           INT,
  max_age           INT,
  price_minor       INT         NOT NULL DEFAULT 0,
  currency          TEXT        NOT NULL DEFAULT 'ILS',
  is_public         BOOLEAN     NOT NULL DEFAULT true,
  billing_frequency VARCHAR(50) NOT NULL DEFAULT 'monthly',
  status            TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'cancelled', 'full')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_terms_tenant      ON terms(tenant_id);
CREATE INDEX idx_levels_tenant     ON levels(tenant_id);
CREATE INDEX idx_teachers_tenant   ON teachers(tenant_id);
CREATE INDEX idx_classes_tenant    ON classes(tenant_id);
CREATE INDEX idx_classes_term      ON classes(term_id);
CREATE INDEX idx_classes_teacher   ON classes(teacher_id);
CREATE INDEX idx_classes_public    ON classes(is_public) WHERE is_public = true;
CREATE INDEX idx_classes_age       ON classes(min_age, max_age);
CREATE INDEX idx_classes_billing   ON classes(billing_frequency);

ALTER TABLE terms    ENABLE ROW LEVEL SECURITY;
ALTER TABLE levels   ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes  ENABLE ROW LEVEL SECURITY;

-- Terms policies
CREATE POLICY "super_admin manages all terms"  ON terms FOR ALL    USING (is_super_admin());
CREATE POLICY "authenticated see own terms"    ON terms FOR SELECT USING (tenant_id = get_my_tenant_id());
CREATE POLICY "admins manage terms"            ON terms FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

-- Levels policies
CREATE POLICY "super_admin manages all levels" ON levels FOR ALL    USING (is_super_admin());
CREATE POLICY "authenticated see own levels"   ON levels FOR SELECT USING (tenant_id = get_my_tenant_id());
CREATE POLICY "admins manage levels"           ON levels FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

-- Teachers policies
CREATE POLICY "super_admin manages all teachers" ON teachers FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage teachers"           ON teachers FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "authenticated read teachers"      ON teachers FOR SELECT USING (tenant_id = get_my_tenant_id());

-- Classes policies
-- anon access to public classes is via get_public_classes_by_subdomain() RPC only
CREATE POLICY "super_admin manages all classes" ON classes FOR ALL    USING (is_super_admin());
CREATE POLICY "authenticated see own classes"   ON classes FOR SELECT USING (tenant_id = get_my_tenant_id());
CREATE POLICY "admins manage classes"           ON classes FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
