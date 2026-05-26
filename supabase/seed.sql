-- Seed data for Ballet School Management System
-- Creates test tenant, terms, levels, and classes for local dev / enrolment testing
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

-- ============================================================================
-- TERMS (Migration 004)
-- ============================================================================
INSERT INTO terms (id, tenant_id, name, start_date, end_date, status)
VALUES
  ('00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Summer 2026', '2026-05-01', '2026-07-31', 'active'),
  ('00000000-0000-0000-0000-000000000103'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Winter 2026', '2026-09-01', '2026-12-31', 'upcoming')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  status = EXCLUDED.status;

-- ============================================================================
-- LEVELS (Migration 004)
-- ============================================================================
INSERT INTO levels (id, tenant_id, name, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000201'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Mini (Ages 3-4)', 1),
  ('00000000-0000-0000-0000-000000000202'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Pre-Primary (Ages 4-6)', 2),
  ('00000000-0000-0000-0000-000000000203'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Primary (Ages 5-7)', 3),
  ('00000000-0000-0000-0000-000000000204'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Grade 1 (Ages 7-10)', 4),
  ('00000000-0000-0000-0000-000000000205'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Grade 2 (Ages 9-13)', 5),
  ('00000000-0000-0000-0000-000000000206'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Grade 3 (Ages 10-16)', 6),
  ('00000000-0000-0000-0000-000000000207'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Pilates (18+)', 7)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- CLASSES (Migration 004)
-- Age ranges live on classes.min_age / classes.max_age (not requirement templates)
-- ============================================================================
INSERT INTO classes (
  id, tenant_id, term_id, level_id, name,
  day_of_week, start_time, end_time,
  min_age, max_age,
  max_capacity, price_minor, currency, is_public, status
)
VALUES
  -- Monday schedule: 45 min slots back-to-back from 15:30, all 240 NIS
  (
    '00000000-0000-0000-0000-000000000301'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000201'::uuid,
    'Mini',
    1, '15:30:00', '16:15:00',
    3, 4,
    10, 24000, 'ILS', true, 'active'
  ),
  (
    '00000000-0000-0000-0000-000000000302'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000202'::uuid,
    'Pre-Primary',
    1, '16:15:00', '17:00:00',
    4, 6,
    16, 24000, 'ILS', true, 'active'
  ),
  (
    '00000000-0000-0000-0000-000000000303'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000203'::uuid,
    'Primary',
    1, '17:00:00', '17:45:00',
    5, 7,
    20, 24000, 'ILS', true, 'active'
  ),
  (
    '00000000-0000-0000-0000-000000000304'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000204'::uuid,
    'Grade 1',
    1, '17:45:00', '18:30:00',
    7, 10,
    20, 24000, 'ILS', true, 'active'
  ),
  (
    '00000000-0000-0000-0000-000000000305'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000205'::uuid,
    'Grade 2',
    1, '18:30:00', '19:15:00',
    9, 13,
    20, 24000, 'ILS', true, 'active'
  ),
  (
    '00000000-0000-0000-0000-000000000306'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000206'::uuid,
    'Grade 3',
    1, '19:15:00', '20:00:00',
    10, 16,
    20, 24000, 'ILS', true, 'active'
  ),
  (
    '00000000-0000-0000-0000-000000000309'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000207'::uuid,
    'Pilates',
    1, '20:00:00', '20:45:00',
    18, NULL,
    15, 24000, 'ILS', true, 'active'
  )
ON CONFLICT (id) DO UPDATE SET
  term_id = EXCLUDED.term_id,
  level_id = EXCLUDED.level_id,
  name = EXCLUDED.name,
  day_of_week = EXCLUDED.day_of_week,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  min_age = EXCLUDED.min_age,
  max_age = EXCLUDED.max_age,
  max_capacity = EXCLUDED.max_capacity,
  price_minor = EXCLUDED.price_minor,
  currency = EXCLUDED.currency,
  is_public = EXCLUDED.is_public,
  status = EXCLUDED.status;

-- Remove legacy seed classes that are no longer in this seed file
DELETE FROM classes
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND id IN (
    '00000000-0000-0000-0000-000000000307'::uuid,
    '00000000-0000-0000-0000-000000000308'::uuid
  );

-- ============================================================================
-- FAMILIES (Migration 002)
-- ============================================================================
INSERT INTO families (id, tenant_id, name, contact_person_name, contact_email, contact_phone, created_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000401'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Stern family',
    'Reuven Teller',
    'tellertwins@gmail.com',
    '0505550101',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000402'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Teller family',
    'Reuven Teller',
    'tellertwins@gmail.com',
    '0505550101',
    now()
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  contact_person_name = EXCLUDED.contact_person_name,
  contact_email = EXCLUDED.contact_email,
  contact_phone = EXCLUDED.contact_phone;

-- ============================================================================
-- FAMILY MEMBERS (Migration 002) — guardian linked to each family
-- ============================================================================
INSERT INTO family_members (id, tenant_id, family_id, user_profile_id, name, email, phone, role, created_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000701'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000401'::uuid,
    NULL,
    'Reuven Teller',
    'tellertwins@gmail.com',
    '0505550101',
    'guardian',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000702'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000402'::uuid,
    NULL,
    'Reuven Teller',
    'tellertwins@gmail.com',
    '0505550101',
    'guardian',
    now()
  )
ON CONFLICT (id) DO UPDATE SET
  family_id = EXCLUDED.family_id,
  user_profile_id = EXCLUDED.user_profile_id,
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role;

UPDATE families SET primary_contact_id = '00000000-0000-0000-0000-000000000701'::uuid
WHERE id = '00000000-0000-0000-0000-000000000401'::uuid;

UPDATE families SET primary_contact_id = '00000000-0000-0000-0000-000000000702'::uuid
WHERE id = '00000000-0000-0000-0000-000000000402'::uuid;

-- ============================================================================
-- PEOPLE (Migration 002)
-- ============================================================================
INSERT INTO people (
  id, tenant_id, user_profile_id, family_id, name, email, date_of_birth,
  medical_notes, allergies,
  emergency_contact_name, emergency_contact_phone,
  photo_consent, media_consent, status,
  waiver_accepted_at, waiver_version,
  created_at, updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000501'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NULL,
    '00000000-0000-0000-0000-000000000401'::uuid,
    'Miriam Stern',
    NULL,
    '2021-05-15'::date,
    NULL,
    NULL,
    'Reuven Teller',
    '0505550101',
    true,
    true,
    'active',
    NULL,
    NULL,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000502'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NULL,
    '00000000-0000-0000-0000-000000000402'::uuid,
    'Ruti Teller',
    NULL,
    '2018-03-22'::date,
    NULL,
    NULL,
    'Reuven Teller',
    '0505550101',
    true,
    true,
    'active',
    NULL,
    NULL,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000503'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NULL,
    NULL,
    'Sara Gold',
    'sara.gold@gmail.com',
    '1994-08-12'::date,
    'Previous ankle sprain (2023) — cleared for full activity.',
    'Penicillin',
    'Daniel Gold',
    '0509876543',
    true,
    false,
    'active',
    '2026-01-15 10:30:00+02'::timestamptz,
    '2026-v1',
    now(),
    now()
  )
ON CONFLICT (id) DO UPDATE SET
  family_id = EXCLUDED.family_id,
  user_profile_id = EXCLUDED.user_profile_id,
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  date_of_birth = EXCLUDED.date_of_birth,
  medical_notes = EXCLUDED.medical_notes,
  allergies = EXCLUDED.allergies,
  emergency_contact_name = EXCLUDED.emergency_contact_name,
  emergency_contact_phone = EXCLUDED.emergency_contact_phone,
  photo_consent = EXCLUDED.photo_consent,
  media_consent = EXCLUDED.media_consent,
  status = EXCLUDED.status,
  waiver_accepted_at = EXCLUDED.waiver_accepted_at,
  waiver_version = EXCLUDED.waiver_version,
  updated_at = now();

-- ============================================================================
-- CONTACT PREFERENCES (Migration 003)
-- ============================================================================
INSERT INTO contact_preferences (
  id, tenant_id, person_id, family_member_id,
  email, email_opted_in, whatsapp_opted_in, voice_opted_in,
  preferred_channel, language, created_at, updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000601'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000501'::uuid,
    NULL,
    'tellertwins@gmail.com',
    true, false, false,
    'email', 'he', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000602'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000502'::uuid,
    NULL,
    'tellertwins@gmail.com',
    true, false, false,
    'email', 'he', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000603'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NULL,
    '00000000-0000-0000-0000-000000000701'::uuid,
    'miriamrstern@gmail.com',
    true, false, false,
    'email', 'he', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000604'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NULL,
    '00000000-0000-0000-0000-000000000702'::uuid,
    'tellertwins@gmail.com',
    true, false, false,
    'email', 'he', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000605'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000503'::uuid,
    NULL,
    'sara.gold@gmail.com',
    true, true, false,
    'email', 'en', now(), now()
  )
ON CONFLICT (id) DO UPDATE SET
  person_id = EXCLUDED.person_id,
  family_member_id = EXCLUDED.family_member_id,
  email = EXCLUDED.email,
  email_opted_in = EXCLUDED.email_opted_in,
  whatsapp_opted_in = EXCLUDED.whatsapp_opted_in,
  voice_opted_in = EXCLUDED.voice_opted_in,
  preferred_channel = EXCLUDED.preferred_channel,
  language = EXCLUDED.language,
  updated_at = now();

-- ============================================================================
-- ADMIN USER — requires matching auth.users row (miriamrteller@gmail.com)
-- ============================================================================
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

-- ============================================================================
-- PARENT / GUARDIAN USER — miriamrstern@gmail.com
--
-- SETUP (do this BEFORE running the SQL below):
--   1. Supabase Dashboard → Authentication → Users → Add user → Create new user
--   2. Email: miriamrstern@gmail.com
--   3. Password: choose a dev password (e.g. for local login testing)
--   4. Auto Confirm User: ON
--   5. Raw User Meta Data (required for auth trigger):
--        {"subdomain": "creativeballet"}
--   6. Copy the new user's UUID from the Users list
--   7. Replace PARENT_AUTH_USER_ID below with that UUID, then re-run seed
--
-- PARENT_AUTH_USER_ID — must match auth.users.id exactly
-- ============================================================================

INSERT INTO user_profiles (
  id,
  tenant_id,
  role,
  email,
  language,
  country
) VALUES (
  '00000000-0000-0000-0000-000000000510'::uuid,  -- ← replace with Supabase Auth UUID
  '00000000-0000-0000-0000-000000000001'::uuid,
  ARRAY['parent', 'guardian'],
  'miriamrstern@gmail.com',
  'he',
  'IL'
) ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  language = EXCLUDED.language,
  country = EXCLUDED.country;

-- Link guardian login to both families (Miriam Stern + Ruti Teller)
UPDATE family_members
SET
  user_profile_id = '00000000-0000-0000-0000-000000000510'::uuid,  -- ← same UUID
  email = 'miriamrstern@gmail.com',
  name = 'Miriam R Stern',
  phone = '0505550101'
WHERE id IN (
  '00000000-0000-0000-0000-000000000701'::uuid,
  '00000000-0000-0000-0000-000000000702'::uuid
);

UPDATE families
SET
  contact_person_name = 'Miriam R Stern',
  contact_email = 'miriamrstern@gmail.com',
  contact_phone = '0505550101'
WHERE id IN (
  '00000000-0000-0000-0000-000000000401'::uuid,
  '00000000-0000-0000-0000-000000000402'::uuid
);

-- Adult solo student record (same login — for Pilates self-enrolment / returning customer)
INSERT INTO people (
  id, tenant_id, user_profile_id, family_id, name, email, date_of_birth,
  medical_notes, allergies,
  emergency_contact_name, emergency_contact_phone,
  photo_consent, media_consent, status,
  created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000504'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000510'::uuid,  -- ← same UUID
  NULL,
  'Miriam R Stern',
  'miriamrstern@gmail.com',
  '1988-03-15'::date,
  NULL,
  NULL,
  'Reuven Teller',
  '0505550101',
  true,
  true,
  'active',
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  user_profile_id = EXCLUDED.user_profile_id,
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  date_of_birth = EXCLUDED.date_of_birth,
  emergency_contact_name = EXCLUDED.emergency_contact_name,
  emergency_contact_phone = EXCLUDED.emergency_contact_phone,
  photo_consent = EXCLUDED.photo_consent,
  media_consent = EXCLUDED.media_consent,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO contact_preferences (
  id, tenant_id, person_id, family_member_id,
  email, email_opted_in, whatsapp_opted_in, voice_opted_in,
  preferred_channel, language, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000606'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000504'::uuid,
  NULL,
  'miriamrstern@gmail.com',
  true, false, false,
  'email', 'he', now(), now()
)
ON CONFLICT (id) DO UPDATE SET
  person_id = EXCLUDED.person_id,
  email = EXCLUDED.email,
  email_opted_in = EXCLUDED.email_opted_in,
  preferred_channel = EXCLUDED.preferred_channel,
  language = EXCLUDED.language,
  updated_at = now();
