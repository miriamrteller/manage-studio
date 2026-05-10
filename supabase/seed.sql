-- Seed data for Phase 1B development
-- Creates test tenant, term, level, and public classes
-- Manual step required: Create auth user in Supabase UI first

-- Insert test tenant (matches VITE_DEV_TENANT_SUBDOMAIN=ballet-school)
INSERT INTO tenants (id, name, subdomain, locale, dir, primary_color, accent_color, currency, vat_rate)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'First Ballet School',
  'ballet-school',
  'he-IL',
  'rtl',
  '#76335a',
  '#e99ac4',
  'ILS',
  0.17
) ON CONFLICT (subdomain) DO NOTHING;

-- Insert test term (Spring 2026)
INSERT INTO terms (id, tenant_id, name, start_date, end_date, is_current)
VALUES (
  '00000000-0000-0000-0000-000000000101'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Spring 2026',
  '2026-01-01',
  '2026-05-31',
  true
) ON CONFLICT DO NOTHING;

-- Insert test level (Beginner)
INSERT INTO levels (id, tenant_id, name, sort_order)
VALUES (
  '00000000-0000-0000-0000-000000000201'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Beginner',
  1
) ON CONFLICT DO NOTHING;

-- Insert test public class (visible on landing page)
INSERT INTO classes (id, tenant_id, term_id, level_id, name, start_time, end_time, max_capacity, price_minor, currency, is_public, status)
VALUES (
  '00000000-0000-0000-0000-000000000301'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000101'::uuid,
  '00000000-0000-0000-0000-000000000201'::uuid,
  'Mini-Ballet age 4',
  '16:15',
  '17:00',
  12,
  1000,
  'ILS',
  true,
  'active'
) ON CONFLICT DO NOTHING;

-- Insert second test public class (different time)
INSERT INTO classes (id, tenant_id, term_id, level_id, name, start_time, end_time, max_capacity, price_minor, currency, is_public, status)
VALUES (
  '00000000-0000-0000-0000-000000000302'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000101'::uuid,
  '00000000-0000-0000-0000-000000000201'::uuid,
  'Mini-Ballet age 5',
  '17:00',
  '17:45',
  16,
  1000,
  'ILS',
  true,
  'active'
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- MANUAL STEPS REQUIRED
-- ============================================================================
-- 1. Create auth user in Supabase console (Authentication > Users > Add User)
--    Email: admin@example.com
--    Copy the user UUID
--
-- 2. Create user_profile entry (run this in Supabase SQL Editor)
--    with your actual auth user UUID:
-- 
--    INSERT INTO user_profiles (id, tenant_id, email, role)
--    VALUES (
--      'your-auth-user-uuid-here',
--      '00000000-0000-0000-0000-000000000001'::uuid,
--      'admin@example.com',
--      ARRAY['tenant_admin']
--    );
--
-- 3. Verify: Navigate to http://localhost:5173/ 
--    Should see "Ballet Beginners — Monday" and "Mini Ballet — Mondays"
-- ============================================================================

