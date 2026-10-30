-- Photographer demo tenant seed (services skin)
-- Run after migrations (and optionally after supabase/seed.sql).
-- Idempotent: safe to re-run.

DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE subdomain = 'photographer') THEN
    -- Owner must exist before provisioning: provision_tenant links it as tenant_admin.
    -- Full auth row + identity (empty-string token columns): GoTrue rejects
    -- password logins with "Database error querying schema" when the token
    -- columns are NULL or the identity row is missing. Password matches the
    -- other dev accounts: devPassword123.
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      'aaaaaaaa-0000-0000-0000-000000000013'::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      'owner@photographer.test',
      crypt('devPassword123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    )
    VALUES (
      'aaaaaaaa-0000-0000-0000-000000000013'::uuid,
      'aaaaaaaa-0000-0000-0000-000000000013'::uuid,
      '{"sub":"aaaaaaaa-0000-0000-0000-000000000013","email":"owner@photographer.test"}'::jsonb,
      'email',
      'aaaaaaaa-0000-0000-0000-000000000013',
      now(), now(), now()
    )
    ON CONFLICT (provider_id, provider) DO NOTHING;

    PERFORM provision_tenant(
      p_name        := 'Photographer Demo',
      p_subdomain   := 'photographer',
      p_plan        := 'essential',
      p_vertical    := 'photographer',
      p_owner_email := 'owner@photographer.test',
      p_owner_id    := 'aaaaaaaa-0000-0000-0000-000000000013'::uuid
    );
  END IF;

  UPDATE tenants
  SET
    name = 'Photographer Demo',
    business_preset = 'services',
    primary_color = '#F97316',
    accent_color = '#FDE68A',
    language_default = 'he'
  WHERE subdomain = 'photographer';

  SELECT id INTO v_tenant_id FROM tenants WHERE subdomain = 'photographer' LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Photographer tenant was not created';
  END IF;

  INSERT INTO seasons (id, tenant_id, name, start_date, end_date, status)
  VALUES
    ('20000000-0000-0000-0000-000000000101'::uuid, v_tenant_id, 'Summer 2026', '2026-06-01', '2026-08-31', 'active'),
    ('20000000-0000-0000-0000-000000000102'::uuid, v_tenant_id, 'Holiday 2026', '2026-09-01', '2026-12-31', 'upcoming')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    status = EXCLUDED.status;

  INSERT INTO categories (id, tenant_id, name, sort_order)
  VALUES
    ('20000000-0000-0000-0000-000000000201'::uuid, v_tenant_id, 'Portrait Sessions', 1),
    ('20000000-0000-0000-0000-000000000202'::uuid, v_tenant_id, 'Family Sessions', 2),
    ('20000000-0000-0000-0000-000000000203'::uuid, v_tenant_id, 'Events', 3)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order;

  -- Packages are APPOINTMENT offerings: duration-based, no weekly slot, no
  -- season (jobs carry their own booked_starts_at/ends_at — see migration
  -- 20261030000100_job_details.sql). The "Custom shoot" package is hidden
  -- (is_public=false, price 0) so quotes with bespoke pricing still have an
  -- offering_id; the price per shoot lives on quotes / payment requests.
  INSERT INTO offerings (
    id, tenant_id, season_id, category_id, name,
    offering_type, duration_mins, day_of_week, start_time, end_time,
    min_age, max_age,
    max_capacity, price_minor, currency, delivery_mode, billing_mode, is_public, status,
    waiver_required, location
  )
  VALUES
    (
      '20000000-0000-0000-0000-000000000301'::uuid, v_tenant_id, NULL,
      '20000000-0000-0000-0000-000000000201'::uuid,
      'Sunset Portrait Session',
      'appointment', 60, NULL, NULL, NULL,
      NULL, NULL,
      1, 45000, 'ILS', 'scheduled', 'one_time', true, 'active',
      true, 'Jaffa Port, Tel Aviv'
    ),
    (
      '20000000-0000-0000-0000-000000000302'::uuid, v_tenant_id, NULL,
      '20000000-0000-0000-0000-000000000202'::uuid,
      'Family Lifestyle Session',
      'appointment', 60, NULL, NULL, NULL,
      NULL, NULL,
      1, 52000, 'ILS', 'scheduled', 'one_time', true, 'active',
      true, 'HaYarkon Park, Tel Aviv'
    ),
    (
      '20000000-0000-0000-0000-000000000303'::uuid, v_tenant_id, NULL,
      '20000000-0000-0000-0000-000000000203'::uuid,
      'Event Coverage (2 hours)',
      'appointment', 120, NULL, NULL, NULL,
      NULL, NULL,
      1, 120000, 'ILS', 'scheduled', 'one_time', true, 'active',
      true, 'Client Venue'
    ),
    (
      '20000000-0000-0000-0000-000000000304'::uuid, v_tenant_id, NULL,
      NULL,
      'Custom shoot / צילום בהתאמה',
      'appointment', 60, NULL, NULL, NULL,
      NULL, NULL,
      1, 0, 'ILS', 'scheduled', 'one_time', false, 'active',
      true, NULL
    )
  ON CONFLICT (id) DO UPDATE SET
    season_id = EXCLUDED.season_id,
    category_id = EXCLUDED.category_id,
    name = EXCLUDED.name,
    offering_type = EXCLUDED.offering_type,
    duration_mins = EXCLUDED.duration_mins,
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
    waiver_required = EXCLUDED.waiver_required,
    location = EXCLUDED.location;

  -- Contract template (the active consent template IS the shoot contract).
  -- Merge fields are rendered server-side per job: {{client_name}},
  -- {{shoot_date}}, {{location}}, {{package}}, {{price}}.
  INSERT INTO consent_templates (id, tenant_id, name, content, version, version_hash, status)
  VALUES (
    '20000000-0000-0000-0000-000000000801'::uuid,
    v_tenant_id,
    'Photography Services Agreement',
    $contract$הסכם שירותי צילום / Photography Services Agreement

לקוח/ה: {{client_name}}
חבילה: {{package}}
מועד הצילום: {{shoot_date}}
מיקום: {{location}}
מחיר: {{price}}

1. השירות. הצלם/ת יספק/תספק את שירותי הצילום המפורטים בחבילה שלעיל במועד ובמיקום שנקבעו. שינוי מועד יתואם בכתב לפחות 48 שעות מראש.
   The Service. The photographer will provide the photography services described in the package above at the agreed date and location. Rescheduling must be agreed in writing at least 48 hours in advance.

2. תשלום. התשלום יבוצע בהתאם לבקשות התשלום שיישלחו ללקוח/ה. הגלריה הסופית תימסר לאחר קבלת מלוא התשלום.
   Payment. Payment is made against the payment requests sent to the client. The final gallery is released after payment in full.

3. זכויות יוצרים ושימוש. זכויות היוצרים בצילומים שמורות לצלם/ת. הלקוח/ה מקבל/ת רישיון לשימוש אישי, לא מסחרי, בתמונות שנמסרו.
   Copyright and use. Copyright in the photographs remains with the photographer. The client receives a licence for personal, non-commercial use of the delivered images.

4. ביטול. ביטול עד 7 ימים לפני המועד – החזר מלא של המקדמה. ביטול מאוחר יותר – המקדמה אינה מוחזרת.
   Cancellation. Cancellation up to 7 days before the date: full refund of the deposit. Later cancellation: the deposit is retained.

בחתימתי אני מאשר/ת כי קראתי והבנתי את ההסכם ומסכים/ה לתנאיו.
By signing I confirm that I have read and understood this agreement and accept its terms.$contract$,
    1,
    encode(digest($contract$הסכם שירותי צילום / Photography Services Agreement

לקוח/ה: {{client_name}}
חבילה: {{package}}
מועד הצילום: {{shoot_date}}
מיקום: {{location}}
מחיר: {{price}}

1. השירות. הצלם/ת יספק/תספק את שירותי הצילום המפורטים בחבילה שלעיל במועד ובמיקום שנקבעו. שינוי מועד יתואם בכתב לפחות 48 שעות מראש.
   The Service. The photographer will provide the photography services described in the package above at the agreed date and location. Rescheduling must be agreed in writing at least 48 hours in advance.

2. תשלום. התשלום יבוצע בהתאם לבקשות התשלום שיישלחו ללקוח/ה. הגלריה הסופית תימסר לאחר קבלת מלוא התשלום.
   Payment. Payment is made against the payment requests sent to the client. The final gallery is released after payment in full.

3. זכויות יוצרים ושימוש. זכויות היוצרים בצילומים שמורות לצלם/ת. הלקוח/ה מקבל/ת רישיון לשימוש אישי, לא מסחרי, בתמונות שנמסרו.
   Copyright and use. Copyright in the photographs remains with the photographer. The client receives a licence for personal, non-commercial use of the delivered images.

4. ביטול. ביטול עד 7 ימים לפני המועד – החזר מלא של המקדמה. ביטול מאוחר יותר – המקדמה אינה מוחזרת.
   Cancellation. Cancellation up to 7 days before the date: full refund of the deposit. Later cancellation: the deposit is retained.

בחתימתי אני מאשר/ת כי קראתי והבנתי את ההסכם ומסכים/ה לתנאיו.
By signing I confirm that I have read and understood this agreement and accept its terms.$contract$, 'sha256'), 'hex'),
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Demo clients: client = account, primary contact = accounts.person_id.
  INSERT INTO people (id, tenant_id, name, email, emergency_contact_phone, status)
  VALUES
    ('20000000-0000-0000-0000-000000000501'::uuid, v_tenant_id, 'נועה ואיתי לוי', 'noa.levi@example.com', '052-1234567', 'active'),
    ('20000000-0000-0000-0000-000000000502'::uuid, v_tenant_id, 'Dana Cohen', 'dana.cohen@example.com', '054-7654321', 'active')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    emergency_contact_phone = EXCLUDED.emergency_contact_phone,
    status = EXCLUDED.status;

  INSERT INTO accounts (id, tenant_id, name, person_id)
  VALUES
    ('20000000-0000-0000-0000-000000000401'::uuid, v_tenant_id, 'נועה ואיתי לוי', '20000000-0000-0000-0000-000000000501'::uuid),
    ('20000000-0000-0000-0000-000000000402'::uuid, v_tenant_id, 'Dana Cohen', '20000000-0000-0000-0000-000000000502'::uuid)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    person_id = EXCLUDED.person_id;

  UPDATE people SET account_id = '20000000-0000-0000-0000-000000000401'::uuid
  WHERE id = '20000000-0000-0000-0000-000000000501'::uuid;
  UPDATE people SET account_id = '20000000-0000-0000-0000-000000000402'::uuid
  WHERE id = '20000000-0000-0000-0000-000000000502'::uuid;

  INSERT INTO account_members (id, tenant_id, account_id, person_id, role)
  VALUES
    ('20000000-0000-0000-0000-000000000701'::uuid, v_tenant_id, '20000000-0000-0000-0000-000000000401'::uuid, '20000000-0000-0000-0000-000000000501'::uuid, 'account_holder'),
    ('20000000-0000-0000-0000-000000000702'::uuid, v_tenant_id, '20000000-0000-0000-0000-000000000402'::uuid, '20000000-0000-0000-0000-000000000502'::uuid, 'account_holder')
  ON CONFLICT (id) DO NOTHING;

  -- Demo shoots: engagement (season NULL, status active) + job_details.
  INSERT INTO engagements (id, tenant_id, person_id, offering_id, season_id, status, booked_starts_at, booked_ends_at)
  VALUES
    ('20000000-0000-0000-0000-000000000901'::uuid, v_tenant_id,
     '20000000-0000-0000-0000-000000000501'::uuid, '20000000-0000-0000-0000-000000000302'::uuid, NULL, 'active',
     '2026-11-13 14:30:00+02', '2026-11-13 15:30:00+02'),
    ('20000000-0000-0000-0000-000000000902'::uuid, v_tenant_id,
     '20000000-0000-0000-0000-000000000502'::uuid, '20000000-0000-0000-0000-000000000301'::uuid, NULL, 'active',
     NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET
    person_id = EXCLUDED.person_id,
    offering_id = EXCLUDED.offering_id,
    season_id = EXCLUDED.season_id,
    status = EXCLUDED.status,
    booked_starts_at = EXCLUDED.booked_starts_at,
    booked_ends_at = EXCLUDED.booked_ends_at;

  INSERT INTO job_details (engagement_id, tenant_id, job_status, location, notes)
  VALUES
    ('20000000-0000-0000-0000-000000000901'::uuid, v_tenant_id, 'booked', 'HaYarkon Park, Tel Aviv', 'Family of four, golden hour. Bring the 85mm.'),
    ('20000000-0000-0000-0000-000000000902'::uuid, v_tenant_id, 'enquiry', NULL, 'Asked about a sunset portrait for an engagement announcement.')
  ON CONFLICT (engagement_id) DO UPDATE SET
    job_status = EXCLUDED.job_status,
    location = EXCLUDED.location,
    notes = EXCLUDED.notes;
END $$;
