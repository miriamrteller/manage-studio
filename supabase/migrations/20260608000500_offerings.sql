-- =============================================================================
-- 000500: Seasons, Categories, Staff, Offerings
-- staff created before offerings so offerings.staff_id FK resolves in-file.
-- min_age / max_age / waiver_required / cover_image_path are first-class columns.
-- DEPENDENCIES: 000200
-- =============================================================================

CREATE TABLE seasons (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id),
  name       TEXT        NOT NULL,
  start_date DATE        NOT NULL,
  end_date   DATE        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'upcoming'
             CHECK (status IN ('upcoming', 'active', 'completed', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_active_season_per_tenant ON seasons(tenant_id) WHERE (status = 'active');

CREATE TABLE categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id),
  name       TEXT        NOT NULL,
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff must exist before offerings references staff_id
CREATE TABLE staff (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id),
  user_profile_id   UUID        REFERENCES user_profiles(id),
  name              TEXT        NOT NULL,
  email             TEXT,
  phone             TEXT,
  contract_type     TEXT        DEFAULT 'hourly'
                    CHECK (contract_type IN ('hourly', 'salary', 'freelance')),
  hourly_rate_minor INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE offerings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id),
  season_id         UUID        REFERENCES seasons(id),
  category_id       UUID        REFERENCES categories(id),
  staff_id          UUID        REFERENCES staff(id),
  name              TEXT        NOT NULL,
  day_of_week       INT         CHECK (day_of_week BETWEEN 0 AND 6),
  start_time        TIME        NOT NULL,
  end_time          TIME        NOT NULL,
  max_capacity      INT         NOT NULL DEFAULT 15,
  min_age           INT,
  max_age           INT,
  price_minor       INT         NOT NULL DEFAULT 0,
  currency          TEXT        NOT NULL DEFAULT 'ILS',
  is_public         BOOLEAN     NOT NULL DEFAULT true,
  delivery_mode     TEXT        NOT NULL DEFAULT 'scheduled'
                    CHECK (delivery_mode IN ('scheduled', 'intangible')),
  billing_mode      TEXT        NOT NULL DEFAULT 'one_time'
                    CHECK (billing_mode IN ('one_time', 'recurring')),
  billing_interval  TEXT        CHECK (billing_interval IN ('monthly', 'quarterly', 'annual')),
  renewal_policy    TEXT        NOT NULL DEFAULT 'none'
                    CHECK (renewal_policy IN ('none', 'fixed_season', 'auto_renew')),
  setup_fee_minor   INT         NOT NULL DEFAULT 0,
  waiver_required   BOOLEAN     NOT NULL DEFAULT true,
  cover_image_path  TEXT,
  status            TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'cancelled', 'full')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT offerings_billing_interval CHECK (
    billing_mode = 'one_time' OR billing_interval IS NOT NULL
  ),
  CONSTRAINT offerings_cover_image_path_format CHECK (
    cover_image_path IS NULL
    OR cover_image_path = tenant_id::text || '/' || id::text || '/cover.webp'
  )
);

COMMENT ON COLUMN offerings.cover_image_path IS
  'Supabase Storage path for class card cover image: {tenant_id}/{offering_id}/cover.webp';

CREATE INDEX idx_seasons_tenant    ON seasons(tenant_id);
CREATE INDEX idx_categories_tenant ON categories(tenant_id);
CREATE INDEX idx_staff_tenant      ON staff(tenant_id);
CREATE INDEX idx_offerings_tenant  ON offerings(tenant_id);
CREATE INDEX idx_offerings_season  ON offerings(season_id);
CREATE INDEX idx_offerings_staff   ON offerings(staff_id);
CREATE INDEX idx_offerings_public  ON offerings(is_public) WHERE is_public = true;
CREATE INDEX idx_offerings_age     ON offerings(min_age, max_age);
CREATE INDEX idx_offerings_billing ON offerings(billing_mode, billing_interval);

ALTER TABLE seasons    ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff      ENABLE ROW LEVEL SECURITY;
ALTER TABLE offerings  ENABLE ROW LEVEL SECURITY;

-- Seasons policies
CREATE POLICY "super_admin manages all seasons" ON seasons FOR ALL    USING (is_super_admin());
CREATE POLICY "authenticated see own seasons"   ON seasons FOR SELECT USING (tenant_id = get_my_tenant_id());
CREATE POLICY "admins manage seasons"           ON seasons FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

-- Categories policies
CREATE POLICY "super_admin manages all categories" ON categories FOR ALL    USING (is_super_admin());
CREATE POLICY "authenticated see own categories"   ON categories FOR SELECT USING (tenant_id = get_my_tenant_id());
CREATE POLICY "admins manage categories"           ON categories FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

-- Staff policies
CREATE POLICY "super_admin manages all staff" ON staff FOR ALL    USING (is_super_admin());
CREATE POLICY "admins manage staff"           ON staff FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY "authenticated read staff"      ON staff FOR SELECT USING (tenant_id = get_my_tenant_id());

-- Offerings policies
-- anon access to public offerings is via get_public_offerings_by_subdomain() RPC only
CREATE POLICY "super_admin manages all offerings" ON offerings FOR ALL    USING (is_super_admin());
CREATE POLICY "authenticated see own offerings"   ON offerings FOR SELECT USING (tenant_id = get_my_tenant_id());
CREATE POLICY "admins manage offerings"           ON offerings FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
