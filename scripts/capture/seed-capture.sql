-- ============================================================================
-- PORTFOLIO CAPTURE SEED — Studio Aviv / Dana Cohen fixture (dev only)
--
-- Run via: node scripts/capture/seed-capture.mjs  (never psql by hand against
-- an unchecked link — the runner pins the dev project ref).
--
-- Creates exactly the fixture described in the capture brief:
--   Studio Aviv (OWN tenant on subdomain studioaviv; creativeballet untouched)
--   payment_provider = 'mock'  → in-page test-card checkout (4580 4580 4580 4580)
--   Tamar Levi     admin@studioaviv.example.com   (tenant_admin)
--   Dana Cohen     dana.cohen@example.com          (account_holder, REGISTERED
--                  before captures run — required for the email-recognition beat)
--   Maya Cohen (7) — pre-enrolled ACTIVE in Ballet — Ages 6-9 (duplicate-block still)
--   Noa Cohen  (4) — exists, NOT enrolled (age-rule still)
--   Ballet — Ages 6-9, Tuesdays 16:00, Fall 2026 season
--
-- Idempotent: fixture rows upsert on fixed UUIDs (00000000-0000-0000-00c0-…),
-- and a cleanup pass removes rows produced by previous capture RUNS (guest
-- families, walk-in enrolments, age-review requests) so every run starts from
-- the same visual state.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. CLEANUP of previous capture-run artifacts.
--    waiver_evidence / waiver_events are immutable by trigger; this is a dev
--    fixture reset, so user triggers are disabled for the delete pass only.
-- ----------------------------------------------------------------------------
ALTER TABLE waiver_evidence DISABLE TRIGGER USER;
ALTER TABLE waiver_events  DISABLE TRIGGER USER;

DO $$
DECLARE
  v_tenant   UUID := '00000000-0000-0000-00c0-000000000001';
  v_offering UUID := '00000000-0000-0000-00c0-000000000301';
  v_keep_engagement UUID := '00000000-0000-0000-00c0-000000001001';
  v_keep_waiver     UUID := '00000000-0000-0000-00c0-000000000901';
  v_run_people UUID[];
  v_run_accounts UUID[];
BEGIN
  -- People created BY capture runs (guest take-2 family + admin walk-in family),
  -- identified by the run-only emails. Their children live in their accounts.
  SELECT COALESCE(array_agg(id), '{}') INTO v_run_people
  FROM people
  WHERE tenant_id = v_tenant
    AND email IN ('danacohen@example.com', 'yael.peretz@example.com');

  SELECT COALESCE(array_agg(id), '{}') INTO v_run_accounts
  FROM accounts
  WHERE tenant_id = v_tenant AND person_id = ANY (v_run_people);

  -- Fold the account children into the delete set.
  SELECT COALESCE(array_agg(id), '{}') INTO v_run_people
  FROM people
  WHERE tenant_id = v_tenant
    AND (id = ANY (v_run_people) OR account_id = ANY (v_run_accounts));

  -- Engagements to remove: anything on the capture offering except the seeded
  -- Maya row, plus anything belonging to run-created people (any offering),
  -- plus Noa's age-review requests.
  CREATE TEMP TABLE _dead_engagements ON COMMIT DROP AS
  SELECT id FROM engagements
  WHERE tenant_id = v_tenant
    AND (
      (offering_id = v_offering AND id <> v_keep_engagement)
      OR person_id = ANY (v_run_people)
      OR (person_id = '00000000-0000-0000-00c0-000000000502' AND status = 'admin_review')
    );

  DELETE FROM document_queue
  WHERE payment_id IN (
    SELECT id FROM payments WHERE engagement_id IN (SELECT id FROM _dead_engagements)
  );
  DELETE FROM payments WHERE engagement_id IN (SELECT id FROM _dead_engagements);
  DELETE FROM engagements WHERE id IN (SELECT id FROM _dead_engagements);

  -- Waivers signed during previous runs (keep the seeded Maya evidence).
  DELETE FROM waiver_events
  WHERE waiver_evidence_id IN (
    SELECT id FROM waiver_evidence
    WHERE tenant_id = v_tenant
      AND (offering_id = v_offering OR person_id = ANY (v_run_people))
      AND id <> v_keep_waiver
  );
  DELETE FROM waiver_evidence
  WHERE tenant_id = v_tenant
    AND (offering_id = v_offering OR person_id = ANY (v_run_people))
    AND id <> v_keep_waiver;

  -- Run-created families themselves.
  DELETE FROM contact_preferences
  WHERE tenant_id = v_tenant
    AND (person_id = ANY (v_run_people)
         OR account_member_id IN (
              SELECT id FROM account_members
              WHERE tenant_id = v_tenant AND account_id = ANY (v_run_accounts)));
  DELETE FROM account_members WHERE tenant_id = v_tenant AND account_id = ANY (v_run_accounts);
  DELETE FROM payment_method_tokens
  WHERE billing_account_id IN (
    SELECT id FROM billing_accounts
    WHERE tenant_id = v_tenant
      AND (account_id = ANY (v_run_accounts) OR person_id = ANY (v_run_people))
  );
  DELETE FROM billing_accounts
  WHERE tenant_id = v_tenant
    AND (account_id = ANY (v_run_accounts) OR person_id = ANY (v_run_people));
  -- people.account_id and accounts.person_id reference each other; break the
  -- cycle, then drop accounts, then people.
  UPDATE people SET account_id = NULL
  WHERE tenant_id = v_tenant AND account_id = ANY (v_run_accounts);
  DELETE FROM accounts WHERE id = ANY (v_run_accounts);
  DELETE FROM people WHERE tenant_id = v_tenant AND id = ANY (v_run_people);

  -- One-time migration: the fixture originally lived ON the creativeballet
  -- tenant. waiver rows are immutable by trigger, so while triggers are off,
  -- pull the seeded Maya evidence (and its events) over to Studio Aviv.
  UPDATE waiver_evidence SET tenant_id = v_tenant
  WHERE id = v_keep_waiver AND tenant_id <> v_tenant;
  UPDATE waiver_events SET tenant_id = v_tenant
  WHERE waiver_evidence_id = v_keep_waiver AND tenant_id <> v_tenant;
END $$;

ALTER TABLE waiver_evidence ENABLE TRIGGER USER;
ALTER TABLE waiver_events  ENABLE TRIGGER USER;

-- ----------------------------------------------------------------------------
-- 1. TENANT — Studio Aviv lives on its OWN tenant + subdomain (studioaviv),
--    so the creativeballet tenant keeps its original seed identity untouched.
--    payment/invoicing 'mock' → in-page test-card checkout, documents issued
--    inline (no cron worker in dev), so cash payments show their invoice
--    number immediately in the payments log.
-- ----------------------------------------------------------------------------
INSERT INTO tenants (id, name, subdomain, language_default, country, primary_color, accent_color, currency, phone_region, business_preset, labels, contact_email, from_email, from_email_verified_at, waiver_require_otp, payment_provider, invoicing_provider, plan, skin, font_pair)
VALUES (
  '00000000-0000-0000-00c0-000000000001'::uuid,
  'Studio Aviv',
  'studioaviv',
  'en',
  'IL',
  '#76335a',
  '#e99ac4',
  'ILS',
  'IL',
  'programs',
  '{}'::jsonb,
  'info@studioaviv.example.com',
  'info@studioaviv.example.com',
  now(),
  false,
  'mock',
  'mock',
  'professional',
  'dance-studio',
  'elegant'
) ON CONFLICT (subdomain) DO UPDATE SET
  name = EXCLUDED.name,
  primary_color = EXCLUDED.primary_color,
  accent_color = EXCLUDED.accent_color,
  payment_provider = EXCLUDED.payment_provider,
  invoicing_provider = EXCLUDED.invoicing_provider,
  font_pair = EXCLUDED.font_pair;

-- ----------------------------------------------------------------------------
-- 2. SEASON + OFFERING — Ballet — Ages 6-9, Tuesdays 16:00, Fall 2026
-- ----------------------------------------------------------------------------
-- Only one season may be 'active' per tenant (partial unique index). Demote
-- whatever is currently active — `pnpm seed:dev` reinstates Summer 2026.
UPDATE seasons
SET status = 'completed'
WHERE tenant_id = '00000000-0000-0000-00c0-000000000001'::uuid
  AND status = 'active'
  AND id <> '00000000-0000-0000-00c0-000000000101'::uuid;

INSERT INTO seasons (id, tenant_id, name, start_date, end_date, status)
VALUES (
  '00000000-0000-0000-00c0-000000000101'::uuid,
  '00000000-0000-0000-00c0-000000000001'::uuid,
  'Fall 2026', '2026-09-01', '2027-01-31', 'active'
)
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  name = EXCLUDED.name,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  status = EXCLUDED.status;

INSERT INTO offerings (
  id, tenant_id, season_id, category_id, name,
  offering_type, day_of_week, start_time, end_time,
  min_age, max_age,
  max_capacity, price_minor, currency, delivery_mode,
  billing_mode, billing_interval, is_public, status, waiver_required, location
)
VALUES (
  '00000000-0000-0000-00c0-000000000301'::uuid,
  '00000000-0000-0000-00c0-000000000001'::uuid,
  '00000000-0000-0000-00c0-000000000101'::uuid,
  NULL,
  'Ballet — Ages 6-9',
  'class', 2, '16:00:00', '17:00:00',
  6, 9,
  20, 32000, 'ILS', 'scheduled',
  'one_time', NULL, true, 'active', true,
  'Studio Aviv, Tel Aviv'
)
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  season_id = EXCLUDED.season_id,
  name = EXCLUDED.name,
  day_of_week = EXCLUDED.day_of_week,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  min_age = EXCLUDED.min_age,
  max_age = EXCLUDED.max_age,
  max_capacity = EXCLUDED.max_capacity,
  price_minor = EXCLUDED.price_minor,
  billing_mode = EXCLUDED.billing_mode,
  billing_interval = EXCLUDED.billing_interval,
  is_public = EXCLUDED.is_public,
  status = EXCLUDED.status,
  waiver_required = EXCLUDED.waiver_required,
  location = EXCLUDED.location;

-- ----------------------------------------------------------------------------
-- 3. AUTH USERS — Dana (parent) + Tamar (admin), password devPassword123.
--    Same direct-insert pattern as supabase/seed.sql; guarded by email too so
--    a half-seeded DB never trips the unique-email constraint.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_encrypted_pw TEXT := crypt('devPassword123', gen_salt('bf'));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = '00000000-0000-0000-00c0-000000000510'::uuid
       OR email = 'dana.cohen@example.com'
  ) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-00c0-000000000510'::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated',
      'dana.cohen@example.com', v_encrypted_pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"subdomain":"studioaviv"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-00c0-000000000510'::uuid,
      '00000000-0000-0000-00c0-000000000510'::uuid,
      '{"sub":"00000000-0000-0000-00c0-000000000510","email":"dana.cohen@example.com"}'::jsonb,
      'email', '00000000-0000-0000-00c0-000000000510',
      now(), now(), now()
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = '00000000-0000-0000-00c0-000000000511'::uuid
       OR email = 'admin@studioaviv.example.com'
  ) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-00c0-000000000511'::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated',
      'admin@studioaviv.example.com', v_encrypted_pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"subdomain":"studioaviv"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-00c0-000000000511'::uuid,
      '00000000-0000-0000-00c0-000000000511'::uuid,
      '{"sub":"00000000-0000-0000-00c0-000000000511","email":"admin@studioaviv.example.com"}'::jsonb,
      'email', '00000000-0000-0000-00c0-000000000511',
      now(), now(), now()
    );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. PROFILES / PEOPLE / FAMILY — Cohen family
-- ----------------------------------------------------------------------------
INSERT INTO user_profiles (id, tenant_id, role, email, language, country)
VALUES
  ('00000000-0000-0000-00c0-000000000510'::uuid,
   '00000000-0000-0000-00c0-000000000001'::uuid,
   ARRAY['account_holder'], 'dana.cohen@example.com', 'en', 'IL'),
  -- super_admin included to match the dev admin seed: people/accounts RLS has
  -- no tenant_admin INSERT policy, so admin intake needs the super_admin path.
  ('00000000-0000-0000-00c0-000000000511'::uuid,
   '00000000-0000-0000-00c0-000000000001'::uuid,
   ARRAY['super_admin', 'tenant_admin'], 'admin@studioaviv.example.com', 'en', 'IL')
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  language = EXCLUDED.language,
  country = EXCLUDED.country;

-- Guardian stub first so accounts.person_id FK is satisfiable.
INSERT INTO people (id, tenant_id, name, created_at, updated_at)
VALUES ('00000000-0000-0000-00c0-000000000504'::uuid,
        '00000000-0000-0000-00c0-000000000001'::uuid, 'Dana Cohen', now(), now())
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, name = EXCLUDED.name;

INSERT INTO accounts (id, tenant_id, name, person_id, created_at)
VALUES ('00000000-0000-0000-00c0-000000000401'::uuid,
        '00000000-0000-0000-00c0-000000000001'::uuid,
        'Cohen family',
        '00000000-0000-0000-00c0-000000000504'::uuid, now())
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  name = EXCLUDED.name,
  person_id = EXCLUDED.person_id;

INSERT INTO people (
  id, tenant_id, user_profile_id, account_id, name, email, date_of_birth,
  emergency_contact_name, emergency_contact_phone,
  photo_consent, media_consent, status, created_at, updated_at
)
VALUES
  -- Dana (guardian; her phone 050-000-0000 is the family's contact number)
  ('00000000-0000-0000-00c0-000000000504'::uuid,
   '00000000-0000-0000-00c0-000000000001'::uuid,
   '00000000-0000-0000-00c0-000000000510'::uuid,
   NULL,
   'Dana Cohen', 'dana.cohen@example.com', '1990-05-14'::date,
   NULL, NULL, true, true, 'active', now(), now()),
  -- Maya, 7 at season start — main-story child
  ('00000000-0000-0000-00c0-000000000501'::uuid,
   '00000000-0000-0000-00c0-000000000001'::uuid,
   NULL,
   '00000000-0000-0000-00c0-000000000401'::uuid,
   'Maya Cohen', NULL, '2019-04-10'::date,
   'Dana Cohen', '050-000-0000', true, true, 'active', now(), now()),
  -- Noa, 4 — deliberately below the 6-9 band
  ('00000000-0000-0000-00c0-000000000502'::uuid,
   '00000000-0000-0000-00c0-000000000001'::uuid,
   NULL,
   '00000000-0000-0000-00c0-000000000401'::uuid,
   'Noa Cohen', NULL, '2022-03-05'::date,
   'Dana Cohen', '050-000-0000', true, true, 'active', now(), now()),
  -- Tamar Levi (admin persona)
  ('00000000-0000-0000-00c0-000000000505'::uuid,
   '00000000-0000-0000-00c0-000000000001'::uuid,
   '00000000-0000-0000-00c0-000000000511'::uuid,
   NULL,
   'Tamar Levi', 'admin@studioaviv.example.com', '1985-11-02'::date,
   NULL, NULL, true, true, 'active', now(), now())
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  user_profile_id = EXCLUDED.user_profile_id,
  account_id = EXCLUDED.account_id,
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  date_of_birth = EXCLUDED.date_of_birth,
  emergency_contact_name = EXCLUDED.emergency_contact_name,
  emergency_contact_phone = EXCLUDED.emergency_contact_phone,
  status = EXCLUDED.status,
  updated_at = now();

UPDATE user_profiles SET person_id = '00000000-0000-0000-00c0-000000000504'::uuid
WHERE id = '00000000-0000-0000-00c0-000000000510'::uuid;
UPDATE user_profiles SET person_id = '00000000-0000-0000-00c0-000000000505'::uuid
WHERE id = '00000000-0000-0000-00c0-000000000511'::uuid;

INSERT INTO account_members (id, tenant_id, account_id, user_profile_id, person_id, role, created_at)
VALUES ('00000000-0000-0000-00c0-000000000701'::uuid,
        '00000000-0000-0000-00c0-000000000001'::uuid,
        '00000000-0000-0000-00c0-000000000401'::uuid,
        '00000000-0000-0000-00c0-000000000510'::uuid,
        '00000000-0000-0000-00c0-000000000504'::uuid,
        'account_holder', now())
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  account_id = EXCLUDED.account_id,
  user_profile_id = EXCLUDED.user_profile_id,
  person_id = EXCLUDED.person_id,
  role = EXCLUDED.role;

INSERT INTO contact_preferences (
  id, tenant_id, person_id, account_member_id,
  email_opted_in, whatsapp_number, whatsapp_opted_in, whatsapp_verified,
  voice_number, voice_opted_in, preferred_channel, language, created_at, updated_at
)
VALUES ('00000000-0000-0000-00c0-000000000601'::uuid,
        '00000000-0000-0000-00c0-000000000001'::uuid,
        NULL,
        '00000000-0000-0000-00c0-000000000701'::uuid,
        true, NULL, false, false, '050-000-0000', false, 'email', 'en', now(), now())
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  account_member_id = EXCLUDED.account_member_id,
  email_opted_in = EXCLUDED.email_opted_in,
  voice_number = EXCLUDED.voice_number,
  preferred_channel = EXCLUDED.preferred_channel,
  language = EXCLUDED.language,
  updated_at = now();

INSERT INTO billing_accounts (id, tenant_id, account_id, person_id, business_tax_id, business_name, status)
VALUES ('00000000-0000-0000-00c0-000000000408'::uuid,
        '00000000-0000-0000-00c0-000000000001'::uuid,
        '00000000-0000-0000-00c0-000000000401'::uuid,
        '00000000-0000-0000-00c0-000000000504'::uuid,
        NULL, NULL, 'active')
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  account_id = EXCLUDED.account_id,
  person_id = EXCLUDED.person_id,
  status = EXCLUDED.status;

-- ----------------------------------------------------------------------------
-- 5. MAYA'S EXISTING ENROLMENT — signed waiver + ACTIVE engagement in Ballet.
--    This is what the duplicate-prevention still (03) trips over.
-- ----------------------------------------------------------------------------
-- Studio Aviv needs its own active consent template (waiver signing reads it,
-- and the evidence insert above selects from it). Clone creativeballet's.
INSERT INTO consent_templates (id, tenant_id, name, content, version, version_hash, status)
SELECT
  '00000000-0000-0000-00c0-000000000d01'::uuid,
  '00000000-0000-0000-00c0-000000000001'::uuid,
  ct.name, ct.content, ct.version, ct.version_hash, 'active'
FROM consent_templates ct
JOIN tenants t ON t.id = ct.tenant_id AND t.subdomain = 'creativeballet'
WHERE ct.status = 'active'
ORDER BY ct.version DESC
LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO waiver_evidence (
  id, tenant_id, person_id, account_member_id, offering_id,
  consent_template_id, consent_version, consent_version_hash, wording_snapshot,
  pdf_storage_path, pdf_sha256, record_hmac, hmac_key_version, viewed_at,
  signed_by_name, signed_by_email, signed_by_role, signature_method,
  guardian_confirmed, signed_at, ip_address, user_agent, accept_language,
  idempotency_key, otp_verify_sid, status, created_at
)
SELECT
  '00000000-0000-0000-00c0-000000000901'::uuid,
  '00000000-0000-0000-00c0-000000000001'::uuid,
  '00000000-0000-0000-00c0-000000000501'::uuid,   -- Maya
  '00000000-0000-0000-00c0-000000000701'::uuid,   -- Dana's membership
  '00000000-0000-0000-00c0-000000000301'::uuid,   -- Ballet — Ages 6-9
  ct.id, ct.version, ct.version_hash, ct.content,
  '00000000-0000-0000-00c0-000000000001/00000000-0000-0000-00c0-000000000501/00000000-0000-0000-00c0-000000000901.pdf',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  1, now() - interval '10 days',
  'Dana Cohen', 'dana.cohen@example.com', 'guardian', 'typed_name_checkbox',
  true, now() - interval '10 days',
  '203.0.113.10'::inet, 'Mozilla/5.0 (capture seed)', 'en-US',
  'capture-maya-ballet-waiver-v1', NULL, 'signed', now()
FROM consent_templates ct
WHERE ct.tenant_id = '00000000-0000-0000-00c0-000000000001'::uuid
  AND ct.status = 'active'
ORDER BY ct.version DESC
LIMIT 1
ON CONFLICT (id) DO NOTHING;  -- immutable by trigger; strays migrated in the cleanup block



INSERT INTO engagements (
  id, tenant_id, person_id, offering_id, season_id, billing_account_id,
  waiver_evidence_id, status, billing_status, payment_received_at, created_at,
  payment_dunning_attempt_count, payment_dunning_next_at
)
VALUES (
  '00000000-0000-0000-00c0-000000001001'::uuid,
  '00000000-0000-0000-00c0-000000000001'::uuid,
  '00000000-0000-0000-00c0-000000000501'::uuid,
  '00000000-0000-0000-00c0-000000000301'::uuid,
  '00000000-0000-0000-00c0-000000000101'::uuid,
  '00000000-0000-0000-00c0-000000000408'::uuid,
  '00000000-0000-0000-00c0-000000000901'::uuid,
  'active', 'current', now() - interval '10 days', now() - interval '10 days',
  0, NULL
)
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  status = 'active',
  billing_status = 'current',
  payment_received_at = EXCLUDED.payment_received_at,
  waiver_evidence_id = EXCLUDED.waiver_evidence_id;

COMMIT;

-- Post-commit sanity readout for the runner log.
SELECT 'tenant' AS entity, name AS value FROM tenants WHERE subdomain = 'studioaviv'
UNION ALL
SELECT 'provider', payment_provider FROM tenants WHERE subdomain = 'studioaviv'
UNION ALL
SELECT 'offering', name FROM offerings WHERE id = '00000000-0000-0000-00c0-000000000301'
UNION ALL
SELECT 'maya_engagement', status FROM engagements WHERE id = '00000000-0000-0000-00c0-000000001001'
UNION ALL
SELECT 'dana_auth', email FROM auth.users WHERE email = 'dana.cohen@example.com'
UNION ALL
SELECT 'tamar_auth', email FROM auth.users WHERE email = 'admin@studioaviv.example.com';
