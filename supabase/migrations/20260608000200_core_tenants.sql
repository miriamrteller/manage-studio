-- =============================================================================
-- 000200: Tenants + User Profiles
-- Foundation: pgcrypto extension, multi-tenant core, RLS helpers, initial policies.
-- DEPENDENCIES: none — run first.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE tenants (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                          TEXT        NOT NULL,
  subdomain                     TEXT        NOT NULL UNIQUE,
  language_default              TEXT        NOT NULL DEFAULT 'he' CHECK (language_default IN ('he', 'en')),
  country                       TEXT        NOT NULL DEFAULT 'IL' CHECK (country IN ('IL', 'US')),
  primary_color                 TEXT        NOT NULL DEFAULT '#76335a',
  accent_color                  TEXT        NOT NULL DEFAULT '#e99ac4',
  currency                      TEXT        NOT NULL DEFAULT 'ILS',
  vat_rate                      NUMERIC(5,4) DEFAULT 0.17,
  prices_include_vat            BOOLEAN     NOT NULL DEFAULT true,
  phone_region                  TEXT        NOT NULL DEFAULT 'IL',
  phone_region_updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  business_preset               TEXT        NOT NULL DEFAULT 'programs'
                                CHECK (business_preset IN ('programs', 'services', 'catalog')),
  labels                        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  from_email                    TEXT,
  stripe_publishable_key        TEXT,
  stripe_secret_key_enc         BYTEA,
  stripe_webhook_secret_enc     BYTEA,
  stripe_account_id             TEXT,
  stripe_credentials_updated_at TIMESTAMPTZ,
  waiver_require_otp            BOOLEAN     NOT NULL DEFAULT false,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN tenants.stripe_secret_key_enc IS 'pgp_sym_encrypt with app.encryption_key (manual runbook). Never expose to clients.';
COMMENT ON COLUMN tenants.language_default IS 'Primary language for tenant. dir (rtl/ltr) is computed from this in the app.';
COMMENT ON COLUMN tenants.country IS 'Country for regional settings (VAT rate, currency, locale).';
COMMENT ON COLUMN tenants.from_email IS
  'Verified sender address for transactional email (waiver reminders, payment confirmations). '
  'When NULL, the send-waiver-reminder / stripe-webhook Edge Functions skip outbound email for the tenant.';
COMMENT ON COLUMN tenants.prices_include_vat IS
  'When true, offerings.price_minor is VAT-inclusive (customer pays this amount). '
  'When false, price_minor is pretax and VAT is added at checkout. See SPEC §2.5.1.';

CREATE TABLE user_profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  UUID        NOT NULL REFERENCES tenants(id),
  role       TEXT[]      NOT NULL DEFAULT ARRAY['account_holder'],
  person_id  UUID,
  email      TEXT,
  language   TEXT CHECK (language IN ('he', 'en', NULL)),
  country    TEXT CHECK (country IN ('IL', 'US', NULL)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN user_profiles.language IS 'NULL = use tenant default; non-NULL overrides tenant.language_default.';
COMMENT ON COLUMN user_profiles.country  IS 'NULL = use tenant default; non-NULL overrides tenant.country.';

CREATE INDEX idx_user_profiles_tenant   ON user_profiles(tenant_id);
CREATE INDEX idx_user_profiles_language ON user_profiles(language);
CREATE INDEX idx_user_profiles_country  ON user_profiles(country);
CREATE INDEX idx_user_profiles_email    ON user_profiles(email);

ALTER TABLE tenants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS helper functions (SECURITY DEFINER, pinned search_path)
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT tenant_id FROM user_profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT 'super_admin' = ANY(role) FROM user_profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_service_role()
RETURNS BOOLEAN LANGUAGE sql STABLE
SET search_path = public AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role',
    false
  )
$$;

-- Tenants policies
CREATE POLICY "users see own tenant"            ON tenants FOR SELECT USING (id = get_my_tenant_id());
CREATE POLICY "super_admin manages all tenants" ON tenants FOR ALL    USING (is_super_admin());
CREATE POLICY "admins update own tenant"        ON tenants FOR UPDATE USING (
  id = get_my_tenant_id()
  AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
);

-- User profiles policies
CREATE POLICY "users read own profile"           ON user_profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "admins manage profiles"           ON user_profiles FOR ALL    USING (tenant_id = get_my_tenant_id() AND 'tenant_admin' = ANY(role));
CREATE POLICY "super_admin manages all profiles" ON user_profiles FOR ALL    USING (is_super_admin());
