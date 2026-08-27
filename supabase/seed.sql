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
-- DEV ENCRYPTION KEY — throwaway, dev only.
--
-- Deliberately seeded here and NOT in 20260608000200_core_tenants.sql: seeds
-- never run against production, so the migration chain cannot carry a key into
-- a real project. On prod this row is inserted once, by hand, with a generated
-- value (docs/deployment/GO-LIVE-PLAN.md Phase B). Until then the credential
-- RPCs raise rather than encrypt with something public.
-- ============================================================================
INSERT INTO private.platform_config (key, value)
VALUES ('encryption_key', 'UEJrMG6V+56CEafyEu+H8wIzIdm+fO3El58wQ7323nU=')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- TENANTS (20260608000200_core_tenants.sql)
-- ============================================================================
INSERT INTO tenants (id, name, subdomain, language_default, country, primary_color, accent_color, currency, phone_region, business_preset, labels, contact_email, from_email, from_email_verified_at, waiver_require_otp, payment_provider, invoicing_provider, plan, skin, font_pair)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Creative Ballet Academy',
  'creativeballet',
  'en',
  'IL',
  '#76335a',
  '#e99ac4',
  'ILS',
  'IL',
  'programs',
  '{}'::jsonb,
  'info@creativeballetacademy.com',  -- contact_email: Reply-To on every send; the studio's real inbox
  'info@creativeballetacademy.com',  -- from_email: aspirational branded sender (Cloudflare-era per-tenant domains)
  NULL,   -- from_email_verified_at: NOT verified. The launch transport (Resend free tier) holds ONE
          -- domain, so every tenant sends as <subdomain>@opalswift.com. Pretend-verifying here made
          -- dev exercise a path production cannot take — real sends came back 403 from Resend.
  false,  -- OTP before waiver signing disabled by default; enable only if Twilio Verify is configured
  'invoice4u',
  'invoice4u',
  'professional',
  'dance-studio',
  'elegant'  -- font_pair: NULL means the 'reliable' default, so seeding one exercises the branded path
) ON CONFLICT (subdomain) DO UPDATE SET
  name = EXCLUDED.name,
  language_default = EXCLUDED.language_default,
  country = EXCLUDED.country,
  primary_color = EXCLUDED.primary_color,
  accent_color = EXCLUDED.accent_color,
  currency = EXCLUDED.currency,
  phone_region = EXCLUDED.phone_region,
  business_preset = EXCLUDED.business_preset,
  labels = EXCLUDED.labels,
  contact_email = EXCLUDED.contact_email,
  from_email = EXCLUDED.from_email,
  from_email_verified_at = EXCLUDED.from_email_verified_at,
  waiver_require_otp = EXCLUDED.waiver_require_otp,
  payment_provider = EXCLUDED.payment_provider,
  invoicing_provider = EXCLUDED.invoicing_provider,
  plan = 'professional',
  skin = 'dance-studio',
  font_pair = EXCLUDED.font_pair;

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
  offering_type,
  day_of_week, start_time, end_time,
  min_age, max_age,
  max_capacity, price_minor, currency, delivery_mode, billing_mode, billing_interval, is_public, status,
  location
)
VALUES
  -- Sunday (day_of_week 0) — class offerings are monthly recurring
  (
    '00000000-0000-0000-0000-000000000303'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000203'::uuid,
    'Primary',
    'class',
    0, '16:30:00', '17:15:00',
    4, 4,
    20, 24000, 'ILS', 'scheduled', 'recurring', 'monthly', true, 'active',
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000304'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000204'::uuid,
    'Grade 1',
    'class',
    0, '17:15:00', '18:00:00',
    6, 6,
    20, 24000, 'ILS', 'scheduled', 'recurring', 'monthly', true, 'active',
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000305'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000205'::uuid,
    'Grade 2',
    'class',
    0, '18:00:00', '18:45:00',
    8, 8,
    20, 24000, 'ILS', 'scheduled', 'recurring', 'monthly', true, 'active',
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000306'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000206'::uuid,
    'Grade 3',
    'class',
    0, '18:45:00', '19:45:00',
    10, 12,
    20, 24000, 'ILS', 'scheduled', 'recurring', 'monthly', true, 'active',
    NULL
  ),
  -- Wednesday (day_of_week 3)
  (
    '00000000-0000-0000-0000-000000000307'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000203'::uuid,
    'Primary',
    'class',
    3, '16:30:00', '17:15:00',
    5, 5,
    20, 24000, 'ILS', 'scheduled', 'recurring', 'monthly', true, 'active',
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000308'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000204'::uuid,
    'Grade 1',
    'class',
    3, '17:15:00', '18:00:00',
    7, 7,
    20, 24000, 'ILS', 'scheduled', 'recurring', 'monthly', true, 'active',
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000301'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000205'::uuid,
    'Grade 2',
    'class',
    3, '18:00:00', '18:45:00',
    9, 9,
    20, 24000, 'ILS', 'scheduled', 'recurring', 'monthly', true, 'active',
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000302'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000206'::uuid,
    'Grade 3',
    'class',
    3, '18:45:00', '19:45:00',
    12, 14,
    20, 24000, 'ILS', 'scheduled', 'recurring', 'monthly', true, 'active',
    NULL
  ),
  -- Adult class — kept for seed-finance Sara Gold self-pay (…0309)
  (
    '00000000-0000-0000-0000-000000000309'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000207'::uuid,
    'Pilates',
    'class',
    1, '10:00:00', '11:00:00',
    18, NULL,
    15, 28000, 'ILS', 'scheduled', 'recurring', 'monthly', true, 'active',
    NULL
  )
ON CONFLICT (id) DO UPDATE SET
  season_id = EXCLUDED.season_id,
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  offering_type = EXCLUDED.offering_type,
  day_of_week = EXCLUDED.day_of_week,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  min_age = EXCLUDED.min_age,
  max_age = EXCLUDED.max_age,
  max_capacity = EXCLUDED.max_capacity,
  price_minor = EXCLUDED.price_minor,
  currency = EXCLUDED.currency,
  billing_mode = EXCLUDED.billing_mode,
  billing_interval = EXCLUDED.billing_interval,
  is_public = EXCLUDED.is_public,
  status = EXCLUDED.status,
  location = EXCLUDED.location;

-- All seed offerings require a signed waiver before enrolment completes.
-- (offerings.waiver_required defaults to true; set explicitly so re-seeding a
--  DB that previously had it disabled still enforces the waiver step.)
UPDATE offerings
SET waiver_required = true
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ============================================================================
-- SCHEDULING — booking settings, availability hours, appointment services
-- Enables /book immediately after seed (requires scheduling:booking.client).
-- Classes: Sunday + Wednesday timetable above. Appointments: bookable 1:1 services.
-- ============================================================================
INSERT INTO tenant_scheduling_settings (
  tenant_id,
  buffer_mins,
  slot_duration_mins,
  max_per_day,
  advance_notice_hrs,
  booking_window_days,
  hold_expiry_mins,
  expiry_reminder_mins,
  is_booking_enabled
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  0,
  60,
  NULL,
  24,
  60,
  20,
  15,
  true
)
ON CONFLICT (tenant_id) DO UPDATE SET
  buffer_mins = EXCLUDED.buffer_mins,
  slot_duration_mins = EXCLUDED.slot_duration_mins,
  max_per_day = EXCLUDED.max_per_day,
  advance_notice_hrs = EXCLUDED.advance_notice_hrs,
  booking_window_days = EXCLUDED.booking_window_days,
  hold_expiry_mins = EXCLUDED.hold_expiry_mins,
  expiry_reminder_mins = EXCLUDED.expiry_reminder_mins,
  is_booking_enabled = EXCLUDED.is_booking_enabled,
  updated_at = now();

DELETE FROM tenant_scheduling_hours
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;

INSERT INTO tenant_scheduling_hours (tenant_id, day_of_week, start_time, end_time, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 0, '16:30:00', '19:45:00', true),  -- Sunday
  ('00000000-0000-0000-0000-000000000001'::uuid, 3, '16:30:00', '19:45:00', true);  -- Wednesday

-- Appointment services / workshops — single (one-time) payment
INSERT INTO offerings (
  id, tenant_id, season_id, category_id, name,
  offering_type, duration_mins,
  day_of_week, start_time, end_time,
  min_age, max_age,
  max_capacity, price_minor, currency, delivery_mode, billing_mode, billing_interval, is_public, status,
  location
)
VALUES
  (
    '00000000-0000-0000-0000-000000000310'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NULL,
    NULL,
    'Party',
    'appointment',
    60,
    NULL, NULL, NULL,
    NULL, NULL,
    1, 50000, 'ILS', 'scheduled', 'one_time', NULL, true, 'active',
    'Studio A, 12 Rothschild Blvd, Tel Aviv'
  ),
  (
    '00000000-0000-0000-0000-000000000311'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NULL,
    NULL,
    'Workshop',
    'appointment',
    90,
    NULL, NULL, NULL,
    NULL, NULL,
    1, 35000, 'ILS', 'scheduled', 'one_time', NULL, true, 'active',
    NULL
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  offering_type = EXCLUDED.offering_type,
  duration_mins = EXCLUDED.duration_mins,
  day_of_week = EXCLUDED.day_of_week,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  price_minor = EXCLUDED.price_minor,
  currency = EXCLUDED.currency,
  billing_mode = EXCLUDED.billing_mode,
  billing_interval = EXCLUDED.billing_interval,
  is_public = EXCLUDED.is_public,
  status = EXCLUDED.status,
  location = EXCLUDED.location;

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
  -- tenant_admin ONLY. super_admin bypasses every tenant-scoped RLS policy
  -- (is_super_admin() policies exist on all tables) and must never be seeded
  -- onto a per-tenant dev account, or that account works on every subdomain.
  ARRAY['tenant_admin'],
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
-- Sara Gold (adult, self-signing) accepted the active waiver for Pilates (…0309).
-- Demonstrates offering_id + guardian_confirmed=false (self signer).
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
  '00000000-0000-0000-0000-000000000309'::uuid,   -- Pilates (adult)
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
    'offering_id', '00000000-0000-0000-0000-000000000306',
    'guardian_confirmed', false
  ),
  '2026-01-15 10:30:00+02'::timestamptz
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Test tenants for local dev — provision via provision_tenant
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

  -- Provision tenants (idempotent: only create when subdomain is missing).
  -- p_owner_id names the owner directly. The old form impersonated each owner via
  -- set_config('request.jwt.claim.sub', ...) so provision_tenant could read
  -- auth.uid(); that relied on auth.uid()'s internals and is no longer needed.
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE subdomain = 'belladance') THEN
    PERFORM provision_tenant(
      p_name        => 'Bella Dance Academy',
      p_subdomain   => 'belladance',
      p_plan        => 'professional',
      p_vertical    => 'dance-studio',
      p_owner_email => 'owner@ballet.test',
      p_owner_id    => v_ballet_owner_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tenants WHERE subdomain = 'lensstudio') THEN
    PERFORM provision_tenant(
      p_name        => 'Lens Studio Photography',
      p_subdomain   => 'lensstudio',
      p_plan        => 'essential',
      p_vertical    => 'photographer',
      p_owner_email => 'owner@photo.test',
      p_owner_id    => v_photo_owner_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tenants WHERE subdomain = 'velvetbeauty') THEN
    PERFORM provision_tenant(
      p_name        => 'Velvet Beauty Clinic',
      p_subdomain   => 'velvetbeauty',
      p_plan        => 'essential',
      p_vertical    => 'beautician',
      p_owner_email => 'owner@beauty.test',
      p_owner_id    => v_beauty_owner_id
    );
  END IF;

  -- Creative Ballet → Invoice4U (IL bundled target). Other demo tenants stay Grow.
  UPDATE tenants
  SET payment_provider = 'invoice4u',
      invoicing_provider = 'invoice4u'
  WHERE subdomain = 'creativeballet';

  UPDATE tenants
  SET payment_provider = 'grow',
      invoicing_provider = 'grow'
  WHERE subdomain IN ('belladance', 'lensstudio', 'velvetbeauty');

  -- font_pair per vertical (DL-DESIGN-009). provision_tenant does not take one,
  -- so these two are set after the fact; creativeballet carries its own in the
  -- INSERT above. Everything else stays NULL on purpose — NULL is the 'reliable'
  -- default, and leaving most tenants there keeps that path exercised too.
  UPDATE tenants SET font_pair = 'dynamic' WHERE subdomain = 'belladance';
  UPDATE tenants SET font_pair = 'warm'    WHERE subdomain = 'velvetbeauty';

END $$;

-- ============================================================================
-- SCREENSHOT USER — dev only.
--
-- test@example.com / 123456, for screenshots and demos without touching a real
-- inbox. example.com is IANA-reserved and can never receive mail, so a stray
-- send cannot reach anyone.
--
-- Safe because seeds never run against production, and `pnpm seed:dev` refuses
-- to run unless the linked project is dev. A known-password account on
-- production would be a straightforward hole.
--
-- Done in SQL rather than via scripts/seed-auth-parent.mjs because that needs a
-- service-role key, which .env.dev deliberately no longer carries.
--
-- Placed at the END of this file on purpose: the on_auth_user_created trigger
-- raises "No tenant available for new user" if tenants is empty, so the tenant
-- inserts above must have run first.
--
-- The auth.identities row is required too. Without it GoTrue has no email
-- identity to match and password sign-in fails even though the user exists.
-- ============================================================================
-- auth.users lives outside the public schema, so reset_dev_db.sql does NOT drop
-- it — this user survives resets, and re-seeding would collide on the unique
-- email index (under a different id, so ON CONFLICT (id) does not catch it).
-- Clear it first to keep the seed idempotent.
DELETE FROM auth.identities WHERE identity_data ->> 'email' = 'test@example.com';
DELETE FROM auth.users WHERE email = 'test@example.com';

-- confirmation_token / recovery_token / email_change_token_new / email_change
-- MUST be '' and not NULL. GoTrue scans them into non-nullable Go strings, so a
-- NULL makes every sign-in fail with a 500 "Database error querying schema" —
-- an error that names neither the column nor the user. Supabase's own signup
-- writes ''; a hand-built row does not. These four have no column default,
-- unlike phone_change / reauthentication_token which default to ''.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-0000000005ee'::uuid,
  'authenticated', 'authenticated',
  'test@example.com',
  extensions.crypt('123456', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"subdomain":"creativeballet"}'::jsonb,
  now(), now(),
  '', '', '', ''
)
ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at;


INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at,
  created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-0000000005ee',
  '00000000-0000-0000-0000-0000000005ee'::uuid,
  '{"sub":"00000000-0000-0000-0000-0000000005ee","email":"test@example.com","email_verified":true,"phone_verified":false}'::jsonb,
  'email', now(), now(), now()
)
ON CONFLICT (provider_id, provider) DO NOTHING;

-- ============================================================================
-- LEADS (20260819000100_leads.sql) — CRM pipeline inquiries, distinct from
-- enrolled accounts. Fixed UUIDs + upserts so re-seeding never duplicates.
-- ============================================================================
INSERT INTO leads (
  id, tenant_id, name, company, title, email, phone,
  stage, channel, interest, offering_id, deal_value_minor, note,
  next_follow_up_at, last_contacted_at, last_communication_note,
  marketing_consent, source_ref, created_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000001501'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Rivka Levy', NULL, NULL, 'rivka.levy@example.com', '+972521234501',
    'contacted', 'whatsapp', 'Birthday party', NULL, 45000, 'Wants a Sunday afternoon slot',
    now() + interval '3 days', now() - interval '1 day', 'Sent party package options',
    true, NULL, now() - interval '4 days'
  ),
  (
    '00000000-0000-0000-0000-000000001502'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Noa Barak', NULL, NULL, 'noa.barak@example.com', NULL,
    'new', 'email', 'Toddler class for age 3', NULL, NULL, NULL,
    NULL, NULL, NULL,
    false, 'seed-msgid-noa-1', now() - interval '1 day'
  ),
  (
    '00000000-0000-0000-0000-000000001503'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Gili Mor', 'Gan Ilanot', 'Kindergarten director', 'gili@ganilanot.example.com', '+972501234503',
    'proposal', 'website', 'Weekly movement class for the gan', NULL, 320000, 'Quote sent, waiting on municipality budget',
    now() + interval '7 days', now() - interval '2 days', 'Sent the group-class proposal PDF',
    true, NULL, now() - interval '12 days'
  ),
  (
    '00000000-0000-0000-0000-000000001504'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Dafna Katz', NULL, NULL, 'dafna.katz@example.com', NULL,
    'lost', 'instagram', 'Adult ballet beginners', NULL, NULL, 'Chose a studio closer to home',
    NULL, now() - interval '20 days', 'Asked about evening hours',
    false, NULL, now() - interval '30 days'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  company = EXCLUDED.company,
  title = EXCLUDED.title,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  stage = EXCLUDED.stage,
  channel = EXCLUDED.channel,
  interest = EXCLUDED.interest,
  deal_value_minor = EXCLUDED.deal_value_minor,
  note = EXCLUDED.note,
  next_follow_up_at = EXCLUDED.next_follow_up_at,
  last_contacted_at = EXCLUDED.last_contacted_at,
  last_communication_note = EXCLUDED.last_communication_note,
  marketing_consent = EXCLUDED.marketing_consent;

-- ============================================================================
-- SECOND TENANT — Studio Aviv (studioaviv.localhost:5173)
--
-- Exists specifically so tenant isolation is testable in dev: its admin
-- account must work ONLY on the studioaviv subdomain, and creativeballet's
-- accounts must be rejected there (and vice versa). Blue "bold" theme so a
-- theming leak between tenants is obvious at a glance next to
-- creativeballet's purple/pink "elegant" theme.
-- ============================================================================
INSERT INTO tenants (id, name, subdomain, language_default, country, primary_color, accent_color, currency, phone_region, business_preset, labels, contact_email, from_email, from_email_verified_at, waiver_require_otp, payment_provider, invoicing_provider, plan, skin, font_pair)
VALUES (
  '00000000-0000-0000-0000-000000000002'::uuid,
  'Studio Aviv',
  'studioaviv',
  'he',
  'IL',
  '#1e40af',  -- bold blue
  '#93c5fd',  -- light blue accent
  'ILS',
  'IL',
  'programs',
  '{}'::jsonb,
  'admin@studioaviv.example.com',
  NULL,   -- from_email: unbranded — sends as studioaviv@platform domain (see #65)
  NULL,
  false,
  'grow',
  'grow',
  'essential',
  'dance-studio',
  'bold'
) ON CONFLICT (subdomain) DO UPDATE SET
  name = EXCLUDED.name,
  language_default = EXCLUDED.language_default,
  country = EXCLUDED.country,
  primary_color = EXCLUDED.primary_color,
  accent_color = EXCLUDED.accent_color,
  currency = EXCLUDED.currency,
  phone_region = EXCLUDED.phone_region,
  business_preset = EXCLUDED.business_preset,
  contact_email = EXCLUDED.contact_email,
  from_email = EXCLUDED.from_email,
  from_email_verified_at = EXCLUDED.from_email_verified_at,
  payment_provider = EXCLUDED.payment_provider,
  invoicing_provider = EXCLUDED.invoicing_provider,
  plan = EXCLUDED.plan,
  skin = EXCLUDED.skin,
  font_pair = EXCLUDED.font_pair;

-- Studio Aviv dev admin — admin@studioaviv.example.com / devPassword123.
-- Full auth.users row (empty-string token columns, matching identity): GoTrue
-- fails password logins with "Database error querying schema" when the token
-- columns are NULL or the identity row is missing.
DO $$
DECLARE
  v_encrypted_pw TEXT := crypt('devPassword123', gen_salt('bf'));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000520'::uuid
  ) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000520'::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      'admin@studioaviv.example.com',
      v_encrypted_pw,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"subdomain":"studioaviv"}'::jsonb,
      now(), now(),
      '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000520'::uuid,
      '00000000-0000-0000-0000-000000000520'::uuid,
      '{"sub":"00000000-0000-0000-0000-000000000520","email":"admin@studioaviv.example.com"}'::jsonb,
      'email',
      '00000000-0000-0000-0000-000000000520',
      now(), now(), now()
    );
  END IF;
END $$;

-- tenant_admin ONLY — never super_admin on a per-tenant dev account.
INSERT INTO user_profiles (id, tenant_id, role, email, language, country)
VALUES (
  '00000000-0000-0000-0000-000000000520'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid,
  ARRAY['tenant_admin'],
  'admin@studioaviv.example.com',
  'he',
  'IL'
) ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  language = EXCLUDED.language,
  country = EXCLUDED.country;
