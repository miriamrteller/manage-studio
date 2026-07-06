-- Therapist demo tenant seed (services skin)
-- Run after migrations (and optionally after supabase/seed.sql).
-- Idempotent: safe to re-run.

DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE subdomain = 'therapist') THEN
    PERFORM provision_tenant(
      p_name := 'Therapist Demo',
      p_subdomain := 'therapist',
      p_business_preset := 'services',
      p_primary_color := '#4CAF50',
      p_accent_color := '#C8E6C9',
      p_language_default := 'he'
    );
  END IF;

  UPDATE tenants
  SET
    name = 'Therapist Demo',
    business_preset = 'services',
    primary_color = '#4CAF50',
    accent_color = '#C8E6C9',
    language_default = 'he'
  WHERE subdomain = 'therapist';

  SELECT id INTO v_tenant_id FROM tenants WHERE subdomain = 'therapist' LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Therapist tenant was not created';
  END IF;

  INSERT INTO seasons (id, tenant_id, name, start_date, end_date, status)
  VALUES
    ('10000000-0000-0000-0000-000000000101'::uuid, v_tenant_id, 'Summer 2026', '2026-06-01', '2026-08-31', 'active'),
    ('10000000-0000-0000-0000-000000000102'::uuid, v_tenant_id, 'Autumn 2026', '2026-09-01', '2026-12-31', 'upcoming')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    status = EXCLUDED.status;

  INSERT INTO categories (id, tenant_id, name, sort_order)
  VALUES
    ('10000000-0000-0000-0000-000000000201'::uuid, v_tenant_id, 'Individual Therapy', 1),
    ('10000000-0000-0000-0000-000000000202'::uuid, v_tenant_id, 'Family Therapy', 2),
    ('10000000-0000-0000-0000-000000000203'::uuid, v_tenant_id, 'Workshops', 3)
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
      '10000000-0000-0000-0000-000000000301'::uuid,
      v_tenant_id,
      '10000000-0000-0000-0000-000000000101'::uuid,
      '10000000-0000-0000-0000-000000000201'::uuid,
      'Initial Assessment (50 min)',
      1, '09:00:00', '09:50:00',
      NULL, NULL,
      1, 32000, 'ILS', 'scheduled', 'one_time', true, 'active',
      'Clinic Room 1, 24 Ibn Gabirol St, Tel Aviv'
    ),
    (
      '10000000-0000-0000-0000-000000000302'::uuid,
      v_tenant_id,
      '10000000-0000-0000-0000-000000000101'::uuid,
      '10000000-0000-0000-0000-000000000201'::uuid,
      'Weekly Individual Session',
      3, '17:00:00', '17:50:00',
      NULL, NULL,
      1, 28000, 'ILS', 'scheduled', 'one_time', true, 'active',
      'Clinic Room 2, 24 Ibn Gabirol St, Tel Aviv'
    ),
    (
      '10000000-0000-0000-0000-000000000303'::uuid,
      v_tenant_id,
      '10000000-0000-0000-0000-000000000101'::uuid,
      '10000000-0000-0000-0000-000000000203'::uuid,
      'Stress Management Group',
      4, '19:00:00', '20:15:00',
      18, NULL,
      8, 18000, 'ILS', 'scheduled', 'one_time', true, 'active',
      'Community Center Hall, 8 Weizmann St, Tel Aviv'
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
