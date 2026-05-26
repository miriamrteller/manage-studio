-- =============================================================================
-- 002: Families + Family Members + People
-- Unified person table; family contact columns baked in (no separate ALTER)
-- DEPENDENCIES: 001
-- =============================================================================

CREATE TABLE families (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL REFERENCES tenants(id),
  primary_contact_id   UUID,
  -- Registration / contact fields
  name                 TEXT,
  contact_person_name  TEXT,
  contact_email        TEXT,
  contact_phone        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE family_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  family_id       UUID        NOT NULL REFERENCES families(id),
  user_profile_id UUID        REFERENCES user_profiles(id),
  name            TEXT        NOT NULL,
  email           TEXT,
  phone           TEXT,
  role            TEXT        NOT NULL DEFAULT 'guardian',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE people (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES tenants(id),
  user_profile_id         UUID        REFERENCES user_profiles(id),
  family_id               UUID        REFERENCES families(id),
  name                    TEXT        NOT NULL,
  email                   TEXT,
  date_of_birth           DATE,
  medical_notes           TEXT,
  allergies               TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  photo_consent           BOOLEAN     NOT NULL DEFAULT false,
  media_consent           BOOLEAN     NOT NULL DEFAULT false,
  status                  TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'inactive', 'withdrawn')),
  waiver_accepted_at      TIMESTAMPTZ,
  waiver_version          TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_people_tenant        ON people(tenant_id);
CREATE INDEX idx_people_family        ON people(family_id);
CREATE INDEX idx_family_members_tenant ON family_members(tenant_id);
CREATE INDEX idx_family_members_family ON family_members(family_id);
CREATE INDEX idx_families_tenant      ON families(tenant_id);

ALTER TABLE families       ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE people         ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_my_family_ids()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT family_id FROM family_members WHERE user_profile_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_my_person_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT id FROM people WHERE user_profile_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_minor(date_of_birth DATE)
RETURNS BOOLEAN LANGUAGE sql STABLE
SET search_path = public AS $$
  SELECT CASE
    WHEN date_of_birth IS NULL THEN false
    WHEN date_of_birth > (now()::date - interval '18 years') THEN true
    ELSE false
  END
$$;

-- Families policies
CREATE POLICY "super_admin manages all families"  ON families FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage families"            ON families FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "family members see own family"     ON families FOR SELECT USING (id IN (SELECT get_my_family_ids()));

-- Family members policies
CREATE POLICY "super_admin manages all family_members" ON family_members FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage family_members"           ON family_members FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "family members see own family"          ON family_members FOR SELECT USING (user_profile_id = auth.uid() OR family_id IN (SELECT get_my_family_ids()));

-- People policies
CREATE POLICY "super_admin manages all people"  ON people FOR ALL    USING (is_super_admin());
CREATE POLICY "staff see all people"            ON people FOR SELECT USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "parents see own family people"   ON people FOR SELECT USING (tenant_id = get_my_tenant_id() AND family_id IN (SELECT get_my_family_ids()));
CREATE POLICY "adult students see self"         ON people FOR SELECT USING (tenant_id = get_my_tenant_id() AND id = get_my_person_id());
