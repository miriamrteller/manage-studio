-- =============================================================================
-- 000200: Tenants + User Profiles
-- Foundation: pgcrypto extension, multi-tenant core, RLS helpers, initial policies.
-- DEPENDENCIES: none — run first.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Hosted Supabase cannot set custom GUCs via ALTER DATABASE (permission denied).
-- Store the dev encryption key in a private table and resolve via get_app_encryption_key(),
-- which prefers the GUC when present (production runbook) and falls back to platform_config.
CREATE SCHEMA private;

CREATE TABLE private.platform_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON private.platform_config FROM PUBLIC;
REVOKE ALL ON private.platform_config FROM anon;
REVOKE ALL ON private.platform_config FROM authenticated;

-- Dev default (matches supabase/seed-finance.sql). Production: set app.encryption_key GUC or
-- UPDATE this row via a secured runbook step — never expose to clients.
INSERT INTO private.platform_config (key, value)
VALUES ('encryption_key', '0uT6CrQXiMJab+raSRxxx0j7ZLYvwKCb2HCoQusCfiY=')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION get_app_encryption_key()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public, extensions
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  enc_key := nullif(current_setting('app.encryption_key', true), '');
  IF enc_key IS NOT NULL THEN
    RETURN enc_key;
  END IF;

  SELECT value INTO enc_key
  FROM private.platform_config
  WHERE key = 'encryption_key'
  LIMIT 1;

  IF enc_key IS NULL OR enc_key = '' THEN
    RAISE EXCEPTION 'app.encryption_key is not configured';
  END IF;

  RETURN enc_key;
END;
$$;

REVOKE ALL ON FUNCTION get_app_encryption_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_app_encryption_key() FROM anon;
REVOKE ALL ON FUNCTION get_app_encryption_key() FROM authenticated;

-- Plan / vertical foundations must exist before tenants (skin FK → verticals).
CREATE TYPE tenant_plan AS ENUM ('essential', 'professional');

CREATE TABLE verticals (
  id               TEXT        PRIMARY KEY,
  display_name     TEXT        NOT NULL,
  plan_restriction tenant_plan,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO verticals (id, display_name, plan_restriction) VALUES
  ('photographer',  'Photography Studio', 'essential'),
  ('beautician',    'Beauty & Wellness',  'essential'),
  ('dance-studio',  'Dance Studio',       'professional'),
  ('generic',       'General',            NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE tenants (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                          TEXT        NOT NULL,
  subdomain                     TEXT        NOT NULL UNIQUE,
  language_default              TEXT        NOT NULL DEFAULT 'he' CHECK (language_default IN ('he', 'en')),
  country                       TEXT        NOT NULL DEFAULT 'IL' CHECK (country IN ('IL', 'US')),
  primary_color                 TEXT        NOT NULL DEFAULT '#76335a',
  accent_color                  TEXT        NOT NULL DEFAULT '#e99ac4',
  currency                      TEXT        NOT NULL DEFAULT 'ILS',
  vat_rate                      NUMERIC(5,4) DEFAULT 0,
  prices_include_vat            BOOLEAN     NOT NULL DEFAULT true,
  invoice_license_number        TEXT        NULL,
  vat_type                      INTEGER     NOT NULL DEFAULT 1,
  phone_region                  TEXT        NOT NULL DEFAULT 'IL',
  phone_region_updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  business_preset               TEXT        NOT NULL DEFAULT 'programs'
                                CHECK (business_preset IN ('programs', 'services', 'catalog')),
  labels                        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  from_email                    TEXT,
  -- Access tier + vertical skin (skin IS the vertical id)
  plan                          tenant_plan NOT NULL DEFAULT 'essential',
  skin                          TEXT        NOT NULL DEFAULT 'generic' REFERENCES verticals(id),
  sub_status                    TEXT        NOT NULL DEFAULT 'trialing'
                                CHECK (sub_status IN ('trialing','active','past_due','canceled')),
  trial_ends_at                 TIMESTAMPTZ,
  onboarding_status             TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (onboarding_status IN ('pending','complete')),
  -- Payment capture (money movement). Slug validated in app/Zod — no Postgres CHECK enum.
  -- Allowed app slugs: stripe|mock|grow|icount|rapyd|tranzila
  payment_provider              TEXT        NOT NULL DEFAULT 'stripe',
  payment_provider_public_key   TEXT,
  payment_provider_secret_enc   BYTEA,
  payment_provider_webhook_enc  BYTEA,
  payment_provider_account_id   TEXT,
  payment_provider_updated_at   TIMESTAMPTZ,
  payment_provider_sandbox      BOOLEAN     NOT NULL DEFAULT true,
  -- Provider-specific non-secret config (secrets stay in *_enc BYTEA)
  -- rapyd_config: { access_key, sandbox, customer_id? }
  -- yesh_config:  { company_id }
  rapyd_config                  JSONB,
  yesh_config                   JSONB,
  tranzila_terminal_name        TEXT
                                CHECK (tranzila_terminal_name IS NULL
                                  OR tranzila_terminal_name ~ '^[a-z][a-z0-9]{2,15}$'),
  -- Invoicing / tax documents (separate from payment capture)
  -- Allowed app slugs: green_invoice|grow|icount|yesh|tranzila
  invoicing_provider            TEXT        NOT NULL DEFAULT 'green_invoice',
  invoicing_account_id          TEXT,
  invoicing_api_key_enc         BYTEA,
  invoicing_secret_enc          BYTEA,
  invoicing_credentials_updated_at TIMESTAMPTZ,
  invoicing_auth_valid_until    TIMESTAMPTZ,
  invoicing_auth_checked_at     TIMESTAMPTZ,
  billing_policy                JSONB       NOT NULL DEFAULT '{}'::jsonb,
  waiver_require_otp            BOOLEAN     NOT NULL DEFAULT false,
  -- Google Calendar OAuth tokens (encrypted)
  google_calendar_refresh_token_enc BYTEA,
  google_calendar_access_token_enc  BYTEA,
  google_calendar_token_expires_at  TIMESTAMPTZ,
  google_calendar_id                TEXT,
  google_calendar_email             TEXT,
  google_calendar_connected_at      TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN tenants.payment_provider_secret_enc IS 'pgp_sym_encrypt with app.encryption_key (manual runbook). Never expose to clients.';
COMMENT ON COLUMN tenants.language_default IS 'Primary language for tenant. dir (rtl/ltr) is computed from this in the app.';
COMMENT ON COLUMN tenants.country IS 'Country for regional settings (currency, locale).';
COMMENT ON COLUMN tenants.from_email IS
  'Verified sender address for transactional email (waiver reminders, payment confirmations). '
  'When NULL, the send-waiver-reminder / handle-payment-event Edge Functions skip outbound email for the tenant.';
COMMENT ON COLUMN tenants.vat_rate IS
  'Legacy field — not used for local VAT computation. Always 0 for new tenants. Grow/GI own tax documents.';
COMMENT ON COLUMN tenants.prices_include_vat IS
  'When true, offerings.price_minor is the amount families pay (gross). App does not split VAT locally.';
COMMENT ON COLUMN tenants.invoice_license_number IS
  'Tenant business license / tax ID (ח.פ or ת.ז). Pass-through to Grow only — no validation.';
COMMENT ON COLUMN tenants.vat_type IS
  'Grow vatType pass-through: 1=included (default), 2=before VAT, 3=exempt. Grow owns document legality.';
COMMENT ON COLUMN tenants.plan IS 'Access tier: essential (appointments) or professional (class enrolment).';
COMMENT ON COLUMN tenants.skin IS 'Vertical id (FK verticals). Controls theming and feature skin_restriction.';
COMMENT ON COLUMN tenants.rapyd_config IS
  'Non-secret Rapyd fields: access_key, sandbox, customer_id. Secret key lives in payment_provider_secret_enc.';
COMMENT ON COLUMN tenants.yesh_config IS
  'Non-secret Yesh fields: company_id. API key lives in invoicing_api_key_enc.';
COMMENT ON COLUMN tenants.tranzila_terminal_name IS
  'Per-tenant Tranzila terminal name. App/secret keys in payment_provider_*_enc when payment_provider=tranzila.';

CREATE INDEX idx_tenants_rapyd_access_key
  ON tenants ((rapyd_config->>'access_key'))
  WHERE rapyd_config->>'access_key' IS NOT NULL;

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
ALTER TABLE verticals     ENABLE ROW LEVEL SECURITY;

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

-- Verticals policies (after is_super_admin exists)
CREATE POLICY verticals_read ON verticals FOR SELECT USING (true);
CREATE POLICY verticals_super_admin ON verticals FOR ALL USING (is_super_admin());
GRANT SELECT ON verticals TO authenticated, anon;

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
