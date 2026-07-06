-- Sofer demo tenant seed (services skin)
-- Run after migrations (and optionally after supabase/seed.sql).
-- Idempotent: safe to re-run.

DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE subdomain = 'sofer') THEN
    PERFORM provision_tenant(
      p_name := 'Sofer Demo',
      p_subdomain := 'sofer',
      p_business_preset := 'services',
      p_primary_color := '#6D1A36',
      p_accent_color := '#D4A5B6',
      p_language_default := 'he'
    );
  END IF;

  UPDATE tenants
  SET
    name = 'Sofer Demo',
    business_preset = 'services',
    primary_color = '#6D1A36',
    accent_color = '#D4A5B6',
    language_default = 'he'
  WHERE subdomain = 'sofer';

  SELECT id INTO v_tenant_id FROM tenants WHERE subdomain = 'sofer' LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Sofer tenant was not created';
  END IF;

  INSERT INTO seasons (id, tenant_id, name, start_date, end_date, status)
  VALUES
    ('30000000-0000-0000-0000-000000000101'::uuid, v_tenant_id, 'Summer 2026', '2026-06-01', '2026-08-31', 'active'),
    ('30000000-0000-0000-0000-000000000102'::uuid, v_tenant_id, 'Winter 2026', '2026-09-01', '2026-12-31', 'upcoming')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    status = EXCLUDED.status;

  INSERT INTO categories (id, tenant_id, name, sort_order)
  VALUES
    ('30000000-0000-0000-0000-000000000201'::uuid, v_tenant_id, 'Mezuzah Services', 1),
    ('30000000-0000-0000-0000-000000000202'::uuid, v_tenant_id, 'Tefillin Services', 2),
    ('30000000-0000-0000-0000-000000000203'::uuid, v_tenant_id, 'Torah Scroll Services', 3)
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
      '30000000-0000-0000-0000-000000000301'::uuid,
      v_tenant_id,
      '30000000-0000-0000-0000-000000000101'::uuid,
      '30000000-0000-0000-0000-000000000201'::uuid,
      'Mezuzah Inspection & Repair',
      1, '10:00:00', '10:45:00',
      NULL, NULL,
      1, 18000, 'ILS', 'scheduled', 'one_time', true, 'active',
      'Workshop, 18 Ben Yehuda St, Jerusalem'
    ),
    (
      '30000000-0000-0000-0000-000000000302'::uuid,
      v_tenant_id,
      '30000000-0000-0000-0000-000000000101'::uuid,
      '30000000-0000-0000-0000-000000000202'::uuid,
      'Tefillin Script Check',
      3, '11:00:00', '11:50:00',
      NULL, NULL,
      1, 24000, 'ILS', 'scheduled', 'one_time', true, 'active',
      'Workshop, 18 Ben Yehuda St, Jerusalem'
    ),
    (
      '30000000-0000-0000-0000-000000000303'::uuid,
      v_tenant_id,
      '30000000-0000-0000-0000-000000000101'::uuid,
      '30000000-0000-0000-0000-000000000203'::uuid,
      'Torah Scroll Letter Restoration',
      4, '12:00:00', '13:00:00',
      NULL, NULL,
      1, 65000, 'ILS', 'scheduled', 'one_time', true, 'active',
      'Workshop, 18 Ben Yehuda St, Jerusalem'
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
