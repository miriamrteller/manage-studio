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

  INSERT INTO offerings (
    id, tenant_id, season_id, category_id, name,
    day_of_week, start_time, end_time,
    min_age, max_age,
    max_capacity, price_minor, currency, delivery_mode, billing_mode, is_public, status,
    location
  )
  VALUES
    (
      '20000000-0000-0000-0000-000000000301'::uuid,
      v_tenant_id,
      '20000000-0000-0000-0000-000000000101'::uuid,
      '20000000-0000-0000-0000-000000000201'::uuid,
      'Sunset Portrait Session',
      0, '18:00:00', '19:00:00',
      NULL, NULL,
      1, 45000, 'ILS', 'scheduled', 'one_time', true, 'active',
      'Jaffa Port, Tel Aviv'
    ),
    (
      '20000000-0000-0000-0000-000000000302'::uuid,
      v_tenant_id,
      '20000000-0000-0000-0000-000000000101'::uuid,
      '20000000-0000-0000-0000-000000000202'::uuid,
      'Family Lifestyle Session',
      5, '16:30:00', '17:30:00',
      NULL, NULL,
      1, 52000, 'ILS', 'scheduled', 'one_time', true, 'active',
      'HaYarkon Park, Tel Aviv'
    ),
    (
      '20000000-0000-0000-0000-000000000303'::uuid,
      v_tenant_id,
      '20000000-0000-0000-0000-000000000101'::uuid,
      '20000000-0000-0000-0000-000000000203'::uuid,
      'Event Coverage (2 hours)',
      4, '19:00:00', '21:00:00',
      NULL, NULL,
      1, 120000, 'ILS', 'scheduled', 'one_time', true, 'active',
      'Client Venue'
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
END $$;
