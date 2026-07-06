-- Art class demo tenant seed (programs skin)
-- Run after migrations (and optionally after supabase/seed.sql).
-- Idempotent: safe to re-run.

DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE subdomain = 'artclass') THEN
    PERFORM provision_tenant(
      p_name := 'Art Class Demo',
      p_subdomain := 'artclass',
      p_business_preset := 'programs',
      p_primary_color := '#1D4ED8',
      p_accent_color := '#93C5FD',
      p_language_default := 'he'
    );
  END IF;

  UPDATE tenants
  SET
    name = 'Art Class Demo',
    business_preset = 'programs',
    primary_color = '#1D4ED8',
    accent_color = '#93C5FD',
    language_default = 'he'
  WHERE subdomain = 'artclass';

  SELECT id INTO v_tenant_id FROM tenants WHERE subdomain = 'artclass' LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Art class tenant was not created';
  END IF;

  INSERT INTO seasons (id, tenant_id, name, start_date, end_date, status)
  VALUES
    ('40000000-0000-0000-0000-000000000101'::uuid, v_tenant_id, 'Summer 2026', '2026-06-01', '2026-08-31', 'active'),
    ('40000000-0000-0000-0000-000000000102'::uuid, v_tenant_id, 'Autumn 2026', '2026-09-01', '2026-12-31', 'upcoming')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    status = EXCLUDED.status;

  INSERT INTO categories (id, tenant_id, name, sort_order)
  VALUES
    ('40000000-0000-0000-0000-000000000201'::uuid, v_tenant_id, 'Kids Painting', 1),
    ('40000000-0000-0000-0000-000000000202'::uuid, v_tenant_id, 'Drawing Fundamentals', 2),
    ('40000000-0000-0000-0000-000000000203'::uuid, v_tenant_id, 'Mixed Media Studio', 3)
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
      '40000000-0000-0000-0000-000000000301'::uuid,
      v_tenant_id,
      '40000000-0000-0000-0000-000000000101'::uuid,
      '40000000-0000-0000-0000-000000000201'::uuid,
      'Color Explorers (Ages 6-8)',
      2, '16:00:00', '17:00:00',
      6, 8,
      14, 22000, 'ILS', 'scheduled', 'one_time', true, 'active',
      'Studio A, 7 Sokolov St, Tel Aviv'
    ),
    (
      '40000000-0000-0000-0000-000000000302'::uuid,
      v_tenant_id,
      '40000000-0000-0000-0000-000000000101'::uuid,
      '40000000-0000-0000-0000-000000000202'::uuid,
      'Sketch Lab (Ages 9-12)',
      3, '17:15:00', '18:30:00',
      9, 12,
      16, 25000, 'ILS', 'scheduled', 'one_time', true, 'active',
      'Studio B, 7 Sokolov St, Tel Aviv'
    ),
    (
      '40000000-0000-0000-0000-000000000303'::uuid,
      v_tenant_id,
      '40000000-0000-0000-0000-000000000101'::uuid,
      '40000000-0000-0000-0000-000000000203'::uuid,
      'Teen Mixed Media (Ages 13-16)',
      4, '18:45:00', '20:00:00',
      13, 16,
      12, 28000, 'ILS', 'scheduled', 'one_time', true, 'active',
      'Studio C, 7 Sokolov St, Tel Aviv'
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
