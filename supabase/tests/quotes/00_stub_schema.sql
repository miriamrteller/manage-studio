-- =============================================================================
-- Minimal stand-in for the Supabase base chain, just enough to apply Thread A's
-- and Thread B's real migrations and 20261030000300_quotes.sql on a plain
-- Postgres 15+.
-- NOT a migration. Used only by supabase/tests/quotes/run.sh.
-- =============================================================================

DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA auth;
-- Tests impersonate a user by setting test.uid.
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- pg_cron stand-in: records schedules so the migration's cron block runs.
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid SERIAL PRIMARY KEY, schedule TEXT, command TEXT);
CREATE FUNCTION cron.schedule(p_schedule TEXT, p_command TEXT) RETURNS INT LANGUAGE sql AS
  $$ INSERT INTO cron.job (schedule, command) VALUES (p_schedule, p_command) RETURNING jobid $$;
CREATE FUNCTION cron.unschedule(p_jobid INT) RETURNS BOOLEAN LANGUAGE sql AS
  $$ DELETE FROM cron.job WHERE jobid = p_jobid RETURNING true $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- Thread B's token default uses gen_random_bytes

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subdomain TEXT,
  currency TEXT NOT NULL DEFAULT 'ILS',
  language_default TEXT NOT NULL DEFAULT 'he'
);
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  role TEXT[] NOT NULL DEFAULT '{}'
);
-- Column shapes follow the base chain (people has no phone column).
CREATE TABLE people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_profile_id UUID,
  account_id UUID,
  name TEXT NOT NULL,
  email TEXT,
  emergency_contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT,
  person_id UUID NOT NULL REFERENCES people(id)
);
CREATE TABLE account_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  person_id UUID NOT NULL REFERENCES people(id),
  role TEXT NOT NULL,
  user_profile_id UUID
);
CREATE TABLE seasons (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE offerings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  offering_type TEXT NOT NULL DEFAULT 'class',
  is_public BOOLEAN NOT NULL DEFAULT true,
  price_minor INT NOT NULL DEFAULT 0,
  duration_mins INT,
  status TEXT NOT NULL DEFAULT 'active',
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE contact_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  person_id UUID NOT NULL REFERENCES people(id),
  email_opted_in BOOLEAN NOT NULL DEFAULT true,
  whatsapp_number TEXT,
  whatsapp_opted_in BOOLEAN NOT NULL DEFAULT false,
  whatsapp_verified BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Thread B adds payments.job_payment_request_id.
CREATE TABLE payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id));
CREATE FUNCTION get_supabase_functions_url() RETURNS TEXT LANGUAGE sql AS $$ SELECT 'http://functions.test' $$;
CREATE FUNCTION get_cron_secret() RETURNS TEXT LANGUAGE sql AS $$ SELECT 'test' $$;
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  stage TEXT NOT NULL DEFAULT 'new',
  interest TEXT,
  note TEXT,
  offering_id UUID REFERENCES offerings(id),
  converted_account_id UUID REFERENCES accounts(id),
  converted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  person_id UUID NOT NULL REFERENCES people(id),
  offering_id UUID NOT NULL REFERENCES offerings(id),
  season_id UUID REFERENCES seasons(id),
  status TEXT NOT NULL DEFAULT 'pending_payment',
  booked_starts_at TIMESTAMPTZ,
  booked_ends_at TIMESTAMPTZ
);
-- Same partial unique index the base chain has; job_insert relies on it.
CREATE UNIQUE INDEX idx_engagements_active_no_season ON engagements(person_id, offering_id)
  WHERE status NOT IN ('cancelled', 'withdrawn') AND season_id IS NULL AND booked_starts_at IS NULL;
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  actor_id UUID,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION get_my_tenant_id() RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT tenant_id FROM user_profiles WHERE id = auth.uid() $$;
CREATE FUNCTION is_super_admin() RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'super_admin' = ANY(role)) $$;
CREATE FUNCTION is_service_role() RETURNS BOOLEAN LANGUAGE sql STABLE AS
  $$ SELECT current_user = 'service_role' $$;
CREATE FUNCTION get_my_person_id() RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT id FROM people WHERE user_profile_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION get_my_account_ids() RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT account_id FROM account_members WHERE user_profile_id = auth.uid() $$;

-- Thread A (20261030000100_job_details.sql) is applied for real by run.sh.

-- Thread B (20261030000200_job_payment_requests.sql) is applied for real by
-- run.sh when available; 01_b_fallback.sql otherwise.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
