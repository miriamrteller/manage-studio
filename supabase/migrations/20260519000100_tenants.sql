-- Migration 001: Tenants + User Profiles
-- Creates the foundational multi-tenant structure
-- RLS enforced on all school-specific tables
-- DEPENDENCIES: None — run this first
-- REQUIRED BY: 002, 003, 004 (all school-specific tables reference tenants)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tenants table: one row per school
CREATE TABLE tenants (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT        NOT NULL,
  subdomain                 TEXT        NOT NULL UNIQUE,
  language_default          TEXT        NOT NULL DEFAULT 'he' CHECK (language_default IN ('he', 'en')),
  country                   TEXT        NOT NULL DEFAULT 'IL' CHECK (country IN ('IL', 'US')),
  primary_color             TEXT        NOT NULL DEFAULT '#76335a',
  accent_color              TEXT        NOT NULL DEFAULT '#e99ac4',
  currency                  TEXT        NOT NULL DEFAULT 'ILS',
  vat_rate                  NUMERIC(5,4) DEFAULT 0.17,
  phone_region              TEXT        NOT NULL DEFAULT 'IL',
  phone_region_updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Stripe (Standard account per school; Connect deferred)
  stripe_publishable_key    TEXT,
  stripe_secret_key_enc     BYTEA,
  stripe_webhook_secret_enc BYTEA,
  stripe_account_id         TEXT,
  stripe_credentials_updated_at TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN tenants.stripe_secret_key_enc IS 'pgp_sym_encrypt with app.encryption_key (manual runbook). Never expose to clients.';

COMMENT ON COLUMN tenants.language_default IS 'Primary language for tenant. Source of truth for UI language. dir (rtl/ltr) is computed from this in the app.';
COMMENT ON COLUMN tenants.country IS 'Country for regional settings (VAT rate, currency, locale). Used with language to compute locale string (e.g., he-IL, en-US).';

-- User profiles: authenticated users mapped to tenants + roles
-- Extends Supabase auth.users
CREATE TABLE user_profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  role          TEXT[]      NOT NULL DEFAULT ARRAY['parent'],
  person_id     UUID,
  email         TEXT,
  language      TEXT CHECK (language IN ('he', 'en', NULL)),
  country       TEXT CHECK (country IN ('IL', 'US', NULL)),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN user_profiles.language IS 'User''s language preference. NULL means use tenant default. Non-NULL overrides tenant.language_default.';
COMMENT ON COLUMN user_profiles.country IS 'User''s country preference. NULL means use tenant default. Non-NULL overrides tenant.country.';

-- Indexes for common queries
CREATE INDEX idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX idx_user_profiles_language ON user_profiles(language);
CREATE INDEX idx_user_profiles_country ON user_profiles(country);
CREATE INDEX idx_user_profiles_email ON user_profiles(email);

-- RLS: Enable on both tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Helper functions for RLS policies
-- All SECURITY DEFINER functions pin search_path to prevent search-path injection.
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

-- Detects service_role JWT (used by Edge Functions for privileged DB access).
-- Not a SECURITY DEFINER — reads only the JWT claim, safe to be STABLE.
CREATE OR REPLACE FUNCTION is_service_role()
RETURNS BOOLEAN LANGUAGE sql STABLE
SET search_path = public AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role',
    false
  )
$$;

-- RLS Policies
-- Tenants: authenticated users see only their own tenant; super_admin sees all.
-- No public/anon read — anon access to branding is via get_tenant_config_by_subdomain() RPC.
CREATE POLICY "users see own tenant" ON tenants FOR SELECT
  USING (id = get_my_tenant_id());

CREATE POLICY "super_admin manages all tenants" ON tenants FOR ALL
  USING (is_super_admin());

CREATE POLICY "admins update own tenant" ON tenants FOR UPDATE
  USING (
    id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  );

-- User profiles: admins manage, users read own; super_admin sees all
CREATE POLICY "users read own profile" ON user_profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "admins manage profiles" ON user_profiles FOR ALL
  USING (tenant_id = get_my_tenant_id() AND 'tenant_admin' = ANY(role));

CREATE POLICY "super_admin manages all profiles" ON user_profiles FOR ALL
  USING (is_super_admin());