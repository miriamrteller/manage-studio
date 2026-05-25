-- Seed data for Ballet School Management System
-- Creates test tenant, terms, levels, and classes for Phase 1B testing
-- Matches VITE_DEV_TENANT_SUBDOMAIN=creativeballet
--
-- IMPORTANT: Tenant Configuration (colors, language, currency, VAT rate)
-- These fields are configured by school administrators during onboarding setup.
-- End-users (students, parents, teachers) send ONLY the subdomain to the frontend.
-- The frontend receives this configuration from the database and applies it to the UI.
-- End-users NEVER send or modify configuration data—this is read-only from their perspective.

-- ============================================================================
-- TENANTS (Migration 001)
-- ============================================================================
INSERT INTO tenants (id, name, subdomain, language_default, country, primary_color, accent_color, currency, vat_rate, phone_region)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Creative Ballet Academy',
  'creativeballet',
  'en',
  'IL',
  '#76335a',
  '#e99ac4',
  'ILS',
  0.17,
  'IL'
) ON CONFLICT (subdomain) DO UPDATE SET
  name = EXCLUDED.name,
  language_default = EXCLUDED.language_default,
  country = EXCLUDED.country,
  primary_color = EXCLUDED.primary_color,
  accent_color = EXCLUDED.accent_color,
  currency = EXCLUDED.currency,
  vat_rate = EXCLUDED.vat_rate,
  phone_region = EXCLUDED.phone_region;

-- TERMS (Migration 004)
INSERT INTO terms (id, tenant_id, name, start_date, end_date, status)
VALUES 
  ('00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Summer 2026', '2026-05-01', '2026-07-31', 'active'),
  ('00000000-0000-0000-0000-000000000103'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Winter 2026', '2026-09-01', '2026-12-31', 'upcoming')
ON CONFLICT (id) DO NOTHING;

-- LEVELS (Migration 004)
INSERT INTO levels (id, tenant_id, name, sort_order)
VALUES 
  ('00000000-0000-0000-0000-000000000201'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Mini (Age 3)', 1),
  ('00000000-0000-0000-0000-000000000202'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Pre-Primary (Age 4)', 2),
  ('00000000-0000-0000-0000-000000000203'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Primary (Ages 5-6)', 3),
  ('00000000-0000-0000-0000-000000000204'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Grade 1 (Ages 7-9)', 4),
  ('00000000-0000-0000-0000-000000000205'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Grade 2 (Ages 10-13)', 5),
  ('00000000-0000-0000-0000-000000000206'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Grade 3 (Ages 14+)', 6)

ON CONFLICT (id) DO NOTHING;

-- CLASSES (Migration 004)
INSERT INTO classes (id, tenant_id, term_id, level_id, name, day_of_week, start_time, end_time, max_capacity, price_minor, currency, is_public, status)
VALUES 
  -- Monday classes
  ('00000000-0000-0000-0000-000000000301'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000201'::uuid, 'Mini Ballet 3:30pm', 1, '15:30:00', '16:15:00', 10, 15000, 'ILS', true, 'active'),
  ('00000000-0000-0000-0000-000000000302'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000202'::uuid, 'Pre-primary 4:15pm', 2, '16:15:00', '17:00:00', 16, 20000, 'ILS', true, 'active'),
  
  -- Wednesday classes
  ('00000000-0000-0000-0000-000000000303'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000203'::uuid, 'Primary 5pm', 3, '17:00:00', '17:45:00', 20, 25000, 'ILS', true, 'active'),
  ('00000000-0000-0000-0000-000000000304'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000204'::uuid, 'Grade 1 5:45pm', 4, '17:45:00', '18:30:00', 20, 30000, 'ILS', true, 'active'),
 
  -- Sunday classes
  ('00000000-0000-0000-0000-000000000307'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000201'::uuid, 'Grade 2 6:30pm', 0, '18:30:00', '19:15:00', 20, 15000, 'ILS', true, 'active'),
  ('00000000-0000-0000-0000-000000000308'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000204'::uuid, 'Grade 3 7:15pm ', 0, '19:15:00', '20:00:00', 20, 30000, 'ILS', true, 'active')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- FAMILIES (Migration 002)
-- ============================================================================
INSERT INTO families (id, tenant_id, name, contact_person_name, contact_email, contact_phone, created_at)
VALUES 
  ('00000000-0000-0000-0000-000000000401'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Teller family', 'Rachel Teller', 'tellertwins@gmail.com', '+972-50-555-0101', now())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PEOPLE (Migration 002)
-- ============================================================================
INSERT INTO people (id, tenant_id, family_id, name, date_of_birth, status, created_at, updated_at)
VALUES 
  ('00000000-0000-0000-0000-000000000501'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000401'::uuid, 'Miriam Stern', '2021-05-15'::date, 'active', now(), now()),
  ('00000000-0000-0000-0000-000000000502'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000401'::uuid, 'Ruti Teller', '2018-03-22'::date, 'active', now(), now())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- CONTACT PREFERENCES (Migration 003)
-- ============================================================================
INSERT INTO contact_preferences (id, tenant_id, person_id, email, email_opted_in, whatsapp_opted_in, voice_opted_in, preferred_channel, language, created_at, updated_at)
VALUES 
  ('00000000-0000-0000-0000-000000000601'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000501'::uuid, 'miriamrstern@gmail.com', true, false, false, 'email', 'he', now(), now()),
  ('00000000-0000-0000-0000-000000000602'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000502'::uuid, 'tellertwins@gmail.com', true, false, false, 'email', 'he', now(), now())
ON CONFLICT DO NOTHING;

-- Replace <ADMIN_UUID> with the actual UUID from the Supabase Auth users table
-- Requires a matching row in auth.users with the same id (create in Supabase Auth first).
INSERT INTO user_profiles (
  id,
  tenant_id,
  role,
  email,
  language,
  country
) VALUES (
  '51149671-b030-4931-9a0d-ca1862ae4f0b',
  '00000000-0000-0000-0000-000000000001'::uuid,
  ARRAY['super_admin', 'tenant_admin'],
  'miriamrteller@gmail.com',
  'en',
  'IL'
) ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  language = EXCLUDED.language,
  country = EXCLUDED.country;