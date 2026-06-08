-- =============================================================================
-- 000300: People + Accounts + Account Members
-- Unified person table. people.account_id <-> accounts circular FK is resolved
-- with a deferred ALTER after both tables exist.
-- DEPENDENCIES: 000200
-- =============================================================================

-- people is created first WITHOUT the account_id FK (accounts does not exist yet).
CREATE TABLE people (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES tenants(id),
  user_profile_id         UUID        REFERENCES user_profiles(id),
  account_id              UUID,
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
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE accounts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id),
  name       TEXT,
  person_id  UUID        NOT NULL REFERENCES people(id),  -- primary contact
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE account_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  account_id      UUID        NOT NULL REFERENCES accounts(id),
  user_profile_id UUID        REFERENCES user_profiles(id),
  person_id       UUID        NOT NULL REFERENCES people(id),
  role            TEXT        NOT NULL DEFAULT 'member',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Resolve the circular reference now that accounts exists.
ALTER TABLE people
  ADD CONSTRAINT fk_people_account FOREIGN KEY (account_id) REFERENCES accounts(id);

CREATE INDEX idx_people_tenant            ON people(tenant_id);
CREATE INDEX idx_people_account           ON people(account_id);
CREATE INDEX idx_accounts_tenant          ON accounts(tenant_id);
CREATE INDEX idx_account_members_tenant   ON account_members(tenant_id);
CREATE INDEX idx_account_members_account  ON account_members(account_id);

ALTER TABLE people          ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_my_account_ids()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT account_id FROM account_members WHERE user_profile_id = auth.uid()
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

-- Accounts policies
CREATE POLICY "super_admin manages all accounts" ON accounts FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage accounts"           ON accounts FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "account members see own account"  ON accounts FOR SELECT USING (id IN (SELECT get_my_account_ids()));

-- Account members policies
CREATE POLICY "super_admin manages all account_members" ON account_members FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage account_members"           ON account_members FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "members see own account_members"         ON account_members FOR SELECT USING (user_profile_id = auth.uid() OR account_id IN (SELECT get_my_account_ids()));

-- People policies
CREATE POLICY "super_admin manages all people" ON people FOR ALL    USING (is_super_admin());
CREATE POLICY "staff see all people"           ON people FOR SELECT USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "account holders see own account people" ON people FOR SELECT USING (tenant_id = get_my_tenant_id() AND account_id IN (SELECT get_my_account_ids()));
CREATE POLICY "adult students see self"        ON people FOR SELECT USING (tenant_id = get_my_tenant_id() AND id = get_my_person_id());
CREATE POLICY "account holders update own account people"
  ON people FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND account_id IN (SELECT get_my_account_ids())
  )
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND account_id IN (SELECT get_my_account_ids())
  );
CREATE POLICY "adult students update self"
  ON people FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND id = get_my_person_id()
  )
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND id = get_my_person_id()
  );
CREATE POLICY "account holders create account children"
  ON people FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND status = 'active'
    AND account_id IN (SELECT get_my_account_ids())
  );
