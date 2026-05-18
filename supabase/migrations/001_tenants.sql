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
  language_default          TEXT        NOT NULL DEFAULT 'he',
  country                   TEXT        NOT NULL DEFAULT 'IL',
  primary_color             TEXT        NOT NULL DEFAULT '#76335a',
  accent_color              TEXT        NOT NULL DEFAULT '#e99ac4',
  currency                  TEXT        NOT NULL DEFAULT 'ILS',
  vat_rate                  NUMERIC(5,4) DEFAULT 0.17,
  phone_region              TEXT        NOT NULL DEFAULT 'IL',
  phone_region_updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User profiles: authenticated users mapped to tenants + roles
-- Extends Supabase auth.users
CREATE TABLE user_profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  role          TEXT[]      NOT NULL DEFAULT ARRAY['parent'],
  person_id     UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_user_profiles_tenant ON user_profiles(tenant_id);

-- RLS: Enable on both tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Helper functions for RLS policies
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT tenant_id FROM user_profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT 'super_admin' = ANY(role) FROM user_profiles WHERE id = auth.uid()
$$;

-- RLS Policies
-- Tenants: public read, users see own for updates
CREATE POLICY "public read tenants" ON tenants FOR SELECT USING (true);

CREATE POLICY "users see own tenant" ON tenants FOR SELECT
  USING (id = get_my_tenant_id());

-- User profiles: admins manage, users read own
CREATE POLICY "users read own profile" ON user_profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "admins manage profiles" ON user_profiles FOR ALL
  USING (tenant_id = get_my_tenant_id() AND 'tenant_admin' = ANY(role));
