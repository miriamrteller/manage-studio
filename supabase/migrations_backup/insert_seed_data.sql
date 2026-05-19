-- Seed Data: Creative Ballet Academy
-- Run this AFTER applying update_existing_schema.sql
-- Creates test tenant, terms, levels, and classes for Phase 1B testing

BEGIN; -- Wrap in transaction for safety

-- ============================================================================
-- TENANTS (Insert or update)
-- ============================================================================
INSERT INTO tenants (id, name, subdomain, language_default, country, primary_color, accent_color, currency, vat_rate, phone_region)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Creative Ballet Academy',
  'creativeballet',
  'he',
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
  vat_rate = EXCLUDED.vat_rate;

-- ============================================================================
-- TERMS (Migration 004)
-- ============================================================================
INSERT INTO terms (id, tenant_id, name, start_date, end_date, status)
VALUES 
  ('00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Spring 2026', '2026-01-01', '2026-05-31', 'active'),
  ('00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Summer 2026', '2026-06-01', '2026-08-31', 'upcoming'),
  ('00000000-0000-0000-0000-000000000103'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Fall 2026', '2026-09-01', '2026-12-31', 'upcoming')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- LEVELS (Migration 004)
-- ============================================================================
INSERT INTO levels (id, tenant_id, name, sort_order)
VALUES 
  ('00000000-0000-0000-0000-000000000201'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Mini (Ages 3-4)', 1),
  ('00000000-0000-0000-0000-000000000202'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Beginner (Ages 5-6)', 2),
  ('00000000-0000-0000-0000-000000000203'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Intermediate (Ages 7-9)', 3),
  ('00000000-0000-0000-0000-000000000204'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Advanced (Ages 10+)', 4)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- CLASSES (Migration 004)
-- ============================================================================
INSERT INTO classes (id, tenant_id, term_id, level_id, name, day_of_week, start_time, end_time, max_capacity, price_minor, currency, vat_rate, is_public, status)
VALUES 
  -- Monday classes
  ('00000000-0000-0000-0000-000000000301'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000201'::uuid, 'Mini Monday 4pm', 1, '16:00:00', '16:45:00', 12, 15000, 'ILS', 0.17, true, 'active'),
  ('00000000-0000-0000-0000-000000000302'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000202'::uuid, 'Beginner Monday 5pm', 1, '17:00:00', '18:00:00', 15, 20000, 'ILS', 0.17, true, 'active'),
  
  -- Wednesday classes
  ('00000000-0000-0000-0000-000000000303'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000203'::uuid, 'Intermediate Wednesday 4pm', 3, '16:00:00', '17:00:00', 18, 25000, 'ILS', 0.17, true, 'active'),
  ('00000000-0000-0000-0000-000000000304'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000204'::uuid, 'Advanced Wednesday 5pm', 3, '17:15:00', '18:30:00', 20, 30000, 'ILS', 0.17, true, 'active'),
  
  -- Friday classes
  ('00000000-0000-0000-0000-000000000305'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000202'::uuid, 'Beginner Friday 3pm', 5, '15:00:00', '16:00:00', 15, 20000, 'ILS', 0.17, true, 'active'),
  ('00000000-0000-0000-0000-000000000306'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000203'::uuid, 'Intermediate Friday 4:15pm', 5, '16:15:00', '17:15:00', 18, 25000, 'ILS', 0.17, true, 'active'),
  
  -- Sunday classes
  ('00000000-0000-0000-0000-000000000307'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000201'::uuid, 'Mini Sunday 10am', 0, '10:00:00', '10:45:00', 12, 15000, 'ILS', 0.17, true, 'active'),
  ('00000000-0000-0000-0000-000000000308'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000204'::uuid, 'Advanced Sunday 11:15am', 0, '11:15:00', '12:30:00', 20, 30000, 'ILS', 0.17, true, 'active')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- FAMILIES (Migration 002)
-- ============================================================================
INSERT INTO families (id, tenant_id, created_at)
VALUES 
  ('00000000-0000-0000-0000-000000000401'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, now())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PEOPLE (Migration 002)
-- ============================================================================
INSERT INTO people (id, tenant_id, family_id, name, date_of_birth, status, created_at, updated_at)
VALUES 
  ('00000000-0000-0000-0000-000000000501'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000401'::uuid, 'Sarah Cohen', '2021-05-15'::date, 'active', now(), now()),
  ('00000000-0000-0000-0000-000000000502'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000401'::uuid, 'David Cohen', '2018-03-22'::date, 'active', now(), now())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- CONTACT PREFERENCES (Migration 003)
-- ============================================================================
INSERT INTO contact_preferences (id, tenant_id, person_id, email, email_opted_in, whatsapp_opted_in, voice_opted_in, preferred_channel, language, created_at, updated_at)
VALUES 
  ('00000000-0000-0000-0000-000000000601'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000501'::uuid, 'sarah@example.com', true, false, false, 'email', 'he', now(), now()),
  ('00000000-0000-0000-0000-000000000602'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000502'::uuid, 'david@example.com', true, false, false, 'email', 'he', now(), now())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Verify seed data was inserted
SELECT 'Tenants' as table_name, COUNT(*) as count FROM tenants UNION ALL
SELECT 'Terms', COUNT(*) FROM terms UNION ALL
SELECT 'Levels', COUNT(*) FROM levels UNION ALL
SELECT 'Classes', COUNT(*) FROM classes UNION ALL
SELECT 'Families', COUNT(*) FROM families UNION ALL
SELECT 'People', COUNT(*) FROM people UNION ALL
SELECT 'Contact Preferences', COUNT(*) FROM contact_preferences;

-- Verify tenant config
SELECT id, name, subdomain, language_default, country, primary_color, accent_color, currency FROM tenants WHERE subdomain = 'creativeballet';

-- Verify public classes
SELECT id, name, day_of_week, start_time, end_time, is_public FROM classes WHERE is_public = true ORDER BY day_of_week, start_time;

COMMIT; -- Complete transaction
