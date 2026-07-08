-- Seed data for Ballet School Management System
-- Creates test tenant, terms, levels, and classes for dev / enrolment testing
-- Matches VITE_DEV_TENANT_SUBDOMAIN=creativeballet
--
-- After Stage 1 finance schema lands: also run supabase/seed-finance.sql (see AGENT-RUNBOOK).
--
-- IMPORTANT: Tenant Configuration (colors, language, currency)
-- Class prices (offerings.price_minor) are gross amounts families pay.
-- VAT on receipts/invoices is handled by the payment/invoicing provider.

-- ============================================================================
-- TENANTS (20260608000200_core_tenants.sql)
-- ============================================================================
INSERT INTO tenants (id, name, subdomain, language_default, country, primary_color, accent_color, currency, vat_rate, prices_include_vat, phone_region, business_preset, labels, from_email, waiver_require_otp)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Creative Ballet Academy',
  'creativeballet',
  'en',
  'IL',
  '#76335a',
  '#e99ac4',
  'ILS',
  0,
  true,
  'IL',
  'programs',
  '{}'::jsonb,
  'noreply@creativeballet.co.il',  -- verified sender for transactional email (waiver reminders, receipts)
  false  -- OTP before waiver signing disabled by default; enable only if Twilio Verify is configured
) ON CONFLICT (subdomain) DO UPDATE SET
  name = EXCLUDED.name,
  language_default = EXCLUDED.language_default,
  country = EXCLUDED.country,
  primary_color = EXCLUDED.primary_color,
  accent_color = EXCLUDED.accent_color,
  currency = EXCLUDED.currency,
  vat_rate = EXCLUDED.vat_rate,
  prices_include_vat = EXCLUDED.prices_include_vat,
  phone_region = EXCLUDED.phone_region,
  business_preset = EXCLUDED.business_preset,
  labels = EXCLUDED.labels,
  from_email = EXCLUDED.from_email,
  waiver_require_otp = EXCLUDED.waiver_require_otp;

-- ============================================================================
-- SEASONS + CATEGORIES + OFFERINGS (20260608000500_offerings.sql)
-- Age ranges live on offerings.min_age / offerings.max_age (not requirement templates)
-- ============================================================================
INSERT INTO seasons (id, tenant_id, name, start_date, end_date, status)
VALUES
  ('00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Summer 2026', '2026-05-01', '2026-07-31', 'active'),
  ('00000000-0000-0000-0000-000000000103'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Winter 2026', '2026-09-01', '2026-12-31', 'upcoming')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  status = EXCLUDED.status;

INSERT INTO categories (id, tenant_id, name, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000201'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Mini', 1),
  ('00000000-0000-0000-0000-000000000202'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Pre-Primary', 2),
  ('00000000-0000-0000-0000-000000000203'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Primary', 3),
  ('00000000-0000-0000-0000-000000000204'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Grade 1', 4),
  ('00000000-0000-0000-0000-000000000205'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Grade 2', 5),
  ('00000000-0000-0000-0000-000000000206'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Grade 3', 6),
  ('00000000-0000-0000-0000-000000000207'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Pilates', 7)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order;

INSERT INTO offerings (
  id, tenant_id, season_id, category_id, name,
  day_of_week, start_time, end_time,
  min_age, max_age,
  max_capacity, price_minor, currency, delivery_mode, billing_mode, is_public, status,
  location
)
VALUES
  (
    '00000000-0000-0000-0000-000000000301'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000201'::uuid,
    'Mini',
    1, '15:30:00', '16:15:00',
    3, 4,
    10, 24000, 'ILS', 'scheduled', 'one_time', true, 'active',
    'Studio A, 12 Rothschild Blvd, Tel Aviv'
  ),
  (
    '00000000-0000-0000-0000-000000000302'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000202'::uuid,
    'Pre-Primary',
    1, '16:15:00', '17:00:00',
    4, 6,
    16, 24000, 'ILS', 'scheduled', 'one_time', true, 'active',
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000303'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000203'::uuid,
    'Primary',
    1, '17:00:00', '17:45:00',
    5, 7,
    20, 24000, 'ILS', 'scheduled', 'one_time', true, 'active',
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000304'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000204'::uuid,
    'Grade 1',
    1, '17:45:00', '18:30:00',
    7, 10,
    20, 24000, 'ILS', 'scheduled', 'one_time', true, 'active',
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000305'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000205'::uuid,
    'Grade 2',
    1, '18:30:00', '19:15:00',
    9, 13,
    20, 24000, 'ILS', 'scheduled', 'one_time', true, 'active',
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000306'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000206'::uuid,
    'Grade 3',
    1, '19:15:00', '20:00:00',
    10, 16,
    20, 24000, 'ILS', 'scheduled', 'one_time', true, 'active',
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000309'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000207'::uuid,
    'Pilates',
    1, '20:00:00', '20:45:00',
    18, NULL,
    15, 24000, 'ILS', 'scheduled', 'one_time', true, 'active',
    'Studio B, 12 Rothschild Blvd, Tel Aviv'
  )
ON CONFLICT (id) DO UPDATE SET
  season_id = EXCLUDED.season_id,
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  day_of_week = EXCLUDED.day_of_week,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  min_age = EXCLUDED.min_age,
  max_age = EXCLUDED.max_age,
  max_capacity = EXCLUDED.max_capacity,
  price_minor = EXCLUDED.price_minor,
  currency = EXCLUDED.currency,
  billing_mode = EXCLUDED.billing_mode,
  is_public = EXCLUDED.is_public,
  status = EXCLUDED.status,
  location = EXCLUDED.location;

DELETE FROM offerings
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND id IN (
    '00000000-0000-0000-0000-000000000307'::uuid,
    '00000000-0000-0000-0000-000000000308'::uuid
  );

-- All seed offerings require a signed waiver before enrolment completes.
-- (offerings.waiver_required defaults to true; set explicitly so re-seeding a
--  DB that previously had it disabled still enforces the waiver step.)
UPDATE offerings
SET waiver_required = true
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ============================================================================
-- PEOPLE + ACCOUNTS (20260608000300_people.sql)
-- accounts.person_id = guardian (primary contact); students link via people.account_id
-- One parent login → one account; multiple children in that account
-- ============================================================================

-- Stub rows so accounts.person_id FK can be satisfied before full people rows
INSERT INTO people (id, tenant_id, name, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000504'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Miriam R Stern', now(), now()),
  ('00000000-0000-0000-0000-000000000501'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Miriam Stern', now(), now()),
  ('00000000-0000-0000-0000-000000000502'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Ruti Stern', now(), now())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO accounts (id, tenant_id, name, person_id, created_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000401'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Stern family',
    '00000000-0000-0000-0000-000000000504'::uuid,
    now()
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  person_id = EXCLUDED.person_id;

INSERT INTO people (
  id, tenant_id, user_profile_id, account_id, name, email, date_of_birth,
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
    'Esther Stern',
    NULL,
    '2021-05-15'::date,
    NULL,
    NULL,
    'Miriam R Stern',
    '0548421987',
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
    '00000000-0000-0000-0000-000000000401'::uuid,
    'Ruti Stern',
    NULL,
    '2018-03-22'::date,
    NULL,
    NULL,
    'Miriam R Stern',
    '0548421987',
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
  account_id = EXCLUDED.account_id,
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
-- CONTACT PREFERENCES (20260608000400_contact_prefs.sql)
-- Keyed by person_id OR account_member_id (contact_owner constraint)
-- ============================================================================
INSERT INTO contact_preferences (
  id, tenant_id, person_id, account_member_id,
  email_opted_in, whatsapp_number, whatsapp_opted_in, whatsapp_verified,
  voice_number, voice_opted_in,
  preferred_channel, language, created_at, updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000601'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000501'::uuid,
    NULL,
    true, NULL, false, false,
    NULL, false,
    'email', 'he', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000602'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000502'::uuid,
    NULL,
    true, NULL, false, false,
    NULL, false,
    'email', 'he', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000605'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000503'::uuid,
    NULL,
    true, '0501234567', true, false,
    NULL, false,
    'email', 'en', now(), now()
  )
ON CONFLICT (id) DO UPDATE SET
  person_id = EXCLUDED.person_id,
  account_member_id = EXCLUDED.account_member_id,
  email_opted_in = EXCLUDED.email_opted_in,
  whatsapp_number = EXCLUDED.whatsapp_number,
  whatsapp_opted_in = EXCLUDED.whatsapp_opted_in,
  whatsapp_verified = EXCLUDED.whatsapp_verified,
  voice_number = EXCLUDED.voice_number,
  voice_opted_in = EXCLUDED.voice_opted_in,
  preferred_channel = EXCLUDED.preferred_channel,
  language = EXCLUDED.language,
  updated_at = now();

-- ============================================================================
-- FINANCE (legacy — removed in Stage 1 schema)
-- invoice_sequences / next_invoice_number are dropped by Stage 1.
-- Post-Stage-1 payment fixtures: supabase/seed-finance.sql
-- ============================================================================

-- ============================================================================
-- AUTH USERS (hosted: run scripts/seed-auth-parent.mjs first if needed)
DO $$
DECLARE
  v_encrypted_pw TEXT := crypt('devPassword123', gen_salt('bf'));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000510'::uuid
  ) THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000510'::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      'miriamrstern@gmail.com',
      v_encrypted_pw,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"subdomain":"creativeballet"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000510'::uuid,
      '00000000-0000-0000-0000-000000000510'::uuid,
      '{"sub":"00000000-0000-0000-0000-000000000510","email":"miriamrstern@gmail.com"}'::jsonb,
      'email',
      '00000000-0000-0000-0000-000000000510',
      now(),
      now(),
      now()
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = '51149671-b030-4931-9a0d-ca1862ae4f0b'::uuid
  ) THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '51149671-b030-4931-9a0d-ca1862ae4f0b'::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      'miriamrteller@gmail.com',
      v_encrypted_pw,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"subdomain":"creativeballet"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      '51149671-b030-4931-9a0d-ca1862ae4f0b'::uuid,
      '51149671-b030-4931-9a0d-ca1862ae4f0b'::uuid,
      '{"sub":"51149671-b030-4931-9a0d-ca1862ae4f0b","email":"miriamrteller@gmail.com"}'::jsonb,
      'email',
      '51149671-b030-4931-9a0d-ca1862ae4f0b',
      now(),
      now(),
      now()
    );
  END IF;
END $$;

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
-- Local: auth user is created above (UUID 00000000-0000-0000-0000-000000000510).
-- Hosted: run `node scripts/seed-auth-parent.mjs`, then re-run this seed file.
-- ============================================================================
INSERT INTO user_profiles (
  id,
  tenant_id,
  role,
  email,
  language,
  country
) VALUES (
  '00000000-0000-0000-0000-000000000510'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  ARRAY['account_holder'],
  'miriamrstern@gmail.com',
  'he',
  'IL'
) ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  language = EXCLUDED.language,
  country = EXCLUDED.country;

-- Adult guardian (same login — parent portal + self-enrolment for Pilates)
INSERT INTO people (
  id, tenant_id, user_profile_id, account_id, name, email, date_of_birth,
  medical_notes, allergies,
  emergency_contact_name, emergency_contact_phone,
  photo_consent, media_consent, status,
  created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000504'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000510'::uuid,
  NULL,
  'Miriam R Stern',
  'miriamrstern@gmail.com',
  '1988-03-15'::date,
  NULL,
  NULL,
  'Reuven Teller',
  '0548421987',
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

UPDATE user_profiles
SET person_id = '00000000-0000-0000-0000-000000000504'::uuid
WHERE id = '00000000-0000-0000-0000-000000000510'::uuid;

-- Legacy cleanup: older seeds linked this parent to two accounts (401 + 402).
-- Re-running seed with ON CONFLICT does not remove the extra membership row.
DELETE FROM contact_preferences
WHERE account_member_id = '00000000-0000-0000-0000-000000000702'::uuid;

DELETE FROM account_members
WHERE user_profile_id = '00000000-0000-0000-0000-000000000510'::uuid
  AND id != '00000000-0000-0000-0000-000000000701'::uuid;

-- Single guardian membership — one parent, one account
INSERT INTO account_members (id, tenant_id, account_id, user_profile_id, person_id, role, created_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000701'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000401'::uuid,
    '00000000-0000-0000-0000-000000000510'::uuid,
    '00000000-0000-0000-0000-000000000504'::uuid,
    'account_holder',
    now()
  )
ON CONFLICT (id) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  user_profile_id = EXCLUDED.user_profile_id,
  person_id = EXCLUDED.person_id,
  role = EXCLUDED.role;

INSERT INTO contact_preferences (
  id, tenant_id, person_id, account_member_id,
  email_opted_in, whatsapp_number, whatsapp_opted_in, whatsapp_verified,
  voice_number, voice_opted_in,
  preferred_channel, language, created_at, updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000606'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000504'::uuid,
    NULL,
    true, NULL, false, false,
    NULL, false,
    'email', 'he', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000604'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NULL,
    '00000000-0000-0000-0000-000000000701'::uuid,
    true, NULL, false, false,
    NULL, false,
    'email', 'he', now(), now()
  )
ON CONFLICT (id) DO UPDATE SET
  person_id = EXCLUDED.person_id,
  account_member_id = EXCLUDED.account_member_id,
  email_opted_in = EXCLUDED.email_opted_in,
  whatsapp_number = EXCLUDED.whatsapp_number,
  whatsapp_opted_in = EXCLUDED.whatsapp_opted_in,
  preferred_channel = EXCLUDED.preferred_channel,
  language = EXCLUDED.language,
  updated_at = now();

-- ============================================================================
-- CONSENT TEMPLATES (20260608000900_consent_templates.sql)
-- Active, lawyer-approved bilingual (HE/EN) waiver. version_hash is the
-- sha256 hex of the exact wording, so waiver_evidence can pin to it.
-- Content/name/hash become immutable once status = 'active' (DB trigger).
-- ============================================================================
INSERT INTO consent_templates (id, tenant_id, name, content, version, version_hash, status, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000801'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Health & Liability Waiver',
  $waiver$כתב הצהרת בריאות, ויתור סיכונים ושחרור מאחריות – סטודיו לבלט
Health Declaration, Assumption of Risk, and Liability Waiver – Ballet Studio

1. הצהרת בריאות וכשירות גופנית (Health & Physical Fitness Declaration)
עברית: אני מצהיר/ה בזאת כי בני/בתי נמצא/ת במצב בריאותי ותזונתי תקין, וכי אין כל מניעה רפואית, גופנית או נפשית להשתתפותו/ה המלאה בשיעורי בלט, חזרות, והופעות (להלן: "הפעילות"). אני מתחייב/ת לעדכן את הסטודיו בכתב ומייד על כל שינוי במצבו/ה הבריאותי של הילד/ה.
English: I hereby declare that my child is in good physical and mental health, and suffers from no medical condition or limitation that would prevent their full participation in ballet classes, rehearsals, and recitals (hereinafter: "the Activity"). I undertake to immediately notify the Studio in writing of any change in my child's health status.

2. הכרה בסיכונים טבעיים (Assumption of Inherent Risks)
עברית: ידוע לי ומקובל עלי כי פעילות מחול ובלט, מעצם טבעה, כרוכה במאמץ פיזי וכוללת סיכונים טבעיים לפציעות גופניות (לרבות מתיחות שרירים, נקעים, נפילות וכיוצא בזה). אני מאשר/ת כי הסכמתי להשתתפות בני/בתי ניתנת מתוך מודעות מלאה לסיכונים אלו, וכי הסטודיו, מוריו ועובדיו לא יישאו באחריות לנזקי גוף הנגרמים כתוצאה מסיכונים טבעיים הכרוכים בפעילות מסוג זה.
English: I understand and accept that dance and ballet activities, by their very nature, involve physical exertion and carry inherent risks of physical injury (including muscle strains, sprains, falls, etc.). I approve my child's participation with full awareness of these risks, and agree that the Studio, its teachers, and staff shall not be held liable for bodily injuries resulting from the natural risks inherent to this activity.

3. שחרור מאחריות ושיפוי (Release of Liability & Indemnification)
עברית: בכפוף לכל דין, אני משחרר/ת את הסטודיו, בעליו, מנהליו, מוריו וכל הפועלים מטעמו, מאחריות לכל נזק (גוף או רכוש) שיגרם לילד/ה במהלך השיעורים או הרסיטלים/הופעות, למעט במקרים בהם הנזק נגרם כתוצאה מרשלנות חמורה או פושעת של הסטודיו. כמו כן, הסטודיו אינו אחראי על אובדן או גניבה של ציוד אישי בשטח הסטודיו או באולמי המופעים.
English: Subject to applicable law, I release the Studio, its owners, directors, teachers, and agents from liability for any damage (bodily or property) caused to the child during classes or recitals, except where the damage is a direct result of the Studio's gross negligence. Furthermore, the Studio is not responsible for lost or stolen personal belongings on the premises or at recital venues.

4. טיפול רפואי דחוף (Emergency Medical Treatment)
עברית: במקרה חירום רפואי במהלך הפעילות, כאשר אין אפשרות ליצור איתי קשר מיידי, אני מסמיך/ה את צוות הסטודיו לנקוט בכל צעד נדרש, לרבות הזמנת מד"א או פינוי לבית חולים, לצורך הענקת טיפול רפואי ראשוני דחוף. כל ההוצאות הכרוכות בכך יחולו עלי בלבד.
English: In the event of a medical emergency during the Activity where I cannot be reached immediately, I authorize the Studio staff to take any necessary actions, including calling Mada (Ambulance) or evacuating to a hospital for urgent first aid. Any associated costs will be borne solely by me.

5. אישור צילום ומדיה - אופציונלי (Photo & Media Release - Optional)
עברית: אני מאשר/ת לסטודיו לצלם את בני/בתי במהלך השיעורים והרסיטלים, ולהשתמש בחומרים אלו (תמונות ווידאו) לצורכי פרסום, שיווק, ורשתות חברתיות של הסטודיו, ללא כל תמורה.
English: I authorize the Studio to photograph/video my child during classes and recitals, and to use these materials for the Studio's promotional, marketing, and social media purposes without financial compensation.$waiver$,
  1,
  encode(digest($waiver$כתב הצהרת בריאות, ויתור סיכונים ושחרור מאחריות – סטודיו לבלט
Health Declaration, Assumption of Risk, and Liability Waiver – Ballet Studio

1. הצהרת בריאות וכשירות גופנית (Health & Physical Fitness Declaration)
עברית: אני מצהיר/ה בזאת כי בני/בתי נמצא/ת במצב בריאותי ותזונתי תקין, וכי אין כל מניעה רפואית, גופנית או נפשית להשתתפותו/ה המלאה בשיעורי בלט, חזרות, והופעות (להלן: "הפעילות"). אני מתחייב/ת לעדכן את הסטודיו בכתב ומייד על כל שינוי במצבו/ה הבריאותי של הילד/ה.
English: I hereby declare that my child is in good physical and mental health, and suffers from no medical condition or limitation that would prevent their full participation in ballet classes, rehearsals, and recitals (hereinafter: "the Activity"). I undertake to immediately notify the Studio in writing of any change in my child's health status.

2. הכרה בסיכונים טבעיים (Assumption of Inherent Risks)
עברית: ידוע לי ומקובל עלי כי פעילות מחול ובלט, מעצם טבעה, כרוכה במאמץ פיזי וכוללת סיכונים טבעיים לפציעות גופניות (לרבות מתיחות שרירים, נקעים, נפילות וכיוצא בזה). אני מאשר/ת כי הסכמתי להשתתפות בני/בתי ניתנת מתוך מודעות מלאה לסיכונים אלו, וכי הסטודיו, מוריו ועובדיו לא יישאו באחריות לנזקי גוף הנגרמים כתוצאה מסיכונים טבעיים הכרוכים בפעילות מסוג זה.
English: I understand and accept that dance and ballet activities, by their very nature, involve physical exertion and carry inherent risks of physical injury (including muscle strains, sprains, falls, etc.). I approve my child's participation with full awareness of these risks, and agree that the Studio, its teachers, and staff shall not be held liable for bodily injuries resulting from the natural risks inherent to this activity.

3. שחרור מאחריות ושיפוי (Release of Liability & Indemnification)
עברית: בכפוף לכל דין, אני משחרר/ת את הסטודיו, בעליו, מנהליו, מוריו וכל הפועלים מטעמו, מאחריות לכל נזק (גוף או רכוש) שיגרם לילד/ה במהלך השיעורים או הרסיטלים/הופעות, למעט במקרים בהם הנזק נגרם כתוצאה מרשלנות חמורה או פושעת של הסטודיו. כמו כן, הסטודיו אינו אחראי על אובדן או גניבה של ציוד אישי בשטח הסטודיו או באולמי המופעים.
English: Subject to applicable law, I release the Studio, its owners, directors, teachers, and agents from liability for any damage (bodily or property) caused to the child during classes or recitals, except where the damage is a direct result of the Studio's gross negligence. Furthermore, the Studio is not responsible for lost or stolen personal belongings on the premises or at recital venues.

4. טיפול רפואי דחוף (Emergency Medical Treatment)
עברית: במקרה חירום רפואי במהלך הפעילות, כאשר אין אפשרות ליצור איתי קשר מיידי, אני מסמיך/ה את צוות הסטודיו לנקוט בכל צעד נדרש, לרבות הזמנת מד"א או פינוי לבית חולים, לצורך הענקת טיפול רפואי ראשוני דחוף. כל ההוצאות הכרוכות בכך יחולו עלי בלבד.
English: In the event of a medical emergency during the Activity where I cannot be reached immediately, I authorize the Studio staff to take any necessary actions, including calling Mada (Ambulance) or evacuating to a hospital for urgent first aid. Any associated costs will be borne solely by me.

5. אישור צילום ומדיה - אופציונלי (Photo & Media Release - Optional)
עברית: אני מאשר/ת לסטודיו לצלם את בני/בתי במהלך השיעורים והרסיטלים, ולהשתמש בחומרים אלו (תמונות ווידאו) לצורכי פרסום, שיווק, ורשתות חברתיות של הסטודיו, ללא כל תמורה.
English: I authorize the Studio to photograph/video my child during classes and recitals, and to use these materials for the Studio's promotional, marketing, and social media purposes without financial compensation.$waiver$, 'sha256'), 'hex'),
  'active',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- WAIVER EVIDENCE + EVENTS (20260608001200_waiver_evidence.sql)
-- Sara Gold (adult, self-signing) accepted the active waiver for her Pilates
-- enrolment. Demonstrates offering_id + guardian_confirmed=false (self signer).
-- pdf_sha256 / record_hmac are placeholders (64 hex zeros) — NOT valid digests;
-- a real signing flow computes these in the accept-waiver Edge Function.
-- Rows are immutable (UPDATE/DELETE blocked), so re-seed uses ON CONFLICT DO NOTHING.
-- ============================================================================
INSERT INTO waiver_evidence (
  id, tenant_id, person_id, account_member_id, offering_id,
  consent_template_id, consent_version, consent_version_hash, wording_snapshot,
  pdf_storage_path, pdf_sha256, record_hmac, hmac_key_version, viewed_at,
  signed_by_name, signed_by_email, signed_by_role, signature_method,
  guardian_confirmed, signed_at, ip_address, user_agent, accept_language,
  idempotency_key, otp_verify_sid, status, created_at
)
SELECT
  '00000000-0000-0000-0000-000000000901'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000503'::uuid,   -- Sara Gold
  NULL,                                            -- adult self-signer; no account_member
  '00000000-0000-0000-0000-000000000309'::uuid,   -- Pilates
  ct.id,
  ct.version,
  ct.version_hash,
  ct.content,
  '00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000503/00000000-0000-0000-0000-000000000901.pdf',
  '0000000000000000000000000000000000000000000000000000000000000000',  -- 64 hex zeros (pdf_sha256 placeholder)
  '0000000000000000000000000000000000000000000000000000000000000000',  -- 64 hex zeros (record_hmac placeholder)
  1,
  '2026-01-15 10:28:00+02'::timestamptz,
  'Sara Gold',
  'sara.gold@gmail.com',
  'self',
  'typed_name_checkbox',
  false,                                           -- self-signer, not a guardian declaration
  '2026-01-15 10:30:00+02'::timestamptz,
  '203.0.113.42'::inet,
  'Mozilla/5.0 (seed)',
  'en-US',
  'seed-sara-gold-pilates-waiver-v1',
  NULL,
  'signed',
  now()
FROM consent_templates ct
WHERE ct.id = '00000000-0000-0000-0000-000000000801'::uuid
ON CONFLICT (id) DO NOTHING;

INSERT INTO waiver_events (id, tenant_id, waiver_evidence_id, event_type, actor_id, metadata, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000951'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000901'::uuid,
  'accepted',
  NULL,
  jsonb_build_object(
    'ip', '203.0.113.42',
    'consent_version', 1,
    'offering_id', '00000000-0000-0000-0000-000000000309',
    'guardian_confirmed', false
  ),
  '2026-01-15 10:30:00+02'::timestamptz
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Test tenants for local dev — provision via provision_tenant_v2
-- ============================================================

-- Ensure test owner users exist in auth.users first.
-- In local Supabase dev these UUIDs are stable; adjust if your local
-- auth.users already has conflicting rows.

DO $$
DECLARE
  v_ballet_owner_id   uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_photo_owner_id    uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_beauty_owner_id   uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
BEGIN

  -- Insert owner users if they don't already exist
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES
    (v_ballet_owner_id,  'owner@ballet.test',  crypt('devpassword', gen_salt('bf')), now(), now(), now()),
    (v_photo_owner_id,   'owner@photo.test',   crypt('devpassword', gen_salt('bf')), now(), now(), now()),
    (v_beauty_owner_id,  'owner@beauty.test',  crypt('devpassword', gen_salt('bf')), now(), now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- Provision tenants
  PERFORM provision_tenant_v2(
    p_subdomain    => 'belladance',
    p_display_name => 'Bella Dance Academy',
    p_owner_id     => v_ballet_owner_id,
    p_plan         => 'professional',
    p_vertical     => 'dance_studio'
  );

  PERFORM provision_tenant_v2(
    p_subdomain    => 'lensstudio',
    p_display_name => 'Lens Studio Photography',
    p_owner_id     => v_photo_owner_id,
    p_plan         => 'essential',
    p_vertical     => 'photography_studio'
  );

  PERFORM provision_tenant_v2(
    p_subdomain    => 'velvetbeauty',
    p_display_name => 'Velvet Beauty Clinic',
    p_owner_id     => v_beauty_owner_id,
    p_plan         => 'essential',
    p_vertical     => 'beauty_clinic'
  );

END $$;
