ALTER TABLE offerings ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE offerings DROP CONSTRAINT IF EXISTS offerings_location_length;
ALTER TABLE offerings ADD CONSTRAINT offerings_location_length
  CHECK (location IS NULL OR char_length(location) <= 500);

COMMENT ON COLUMN offerings.location IS
  'Human-readable class location for listings and emails. Display text only — not a normalized address.';

DROP FUNCTION IF EXISTS get_public_offerings_by_subdomain(TEXT);

CREATE OR REPLACE FUNCTION get_public_offerings_by_subdomain(p_subdomain TEXT)
RETURNS TABLE (
  id UUID, tenant_id UUID, tenant_subdomain TEXT, name TEXT,
  day_of_week INT, start_time TIME, end_time TIME,
  max_capacity INT, min_age INT, max_age INT,
  price_minor INT, currency TEXT, season_id UUID, season_start_date DATE,
  category_id UUID, category_name TEXT, status TEXT,
  billing_mode TEXT, billing_interval TEXT,
  cover_image_path TEXT, updated_at TIMESTAMPTZ, waiver_required BOOLEAN,
  location TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_subdomain IS NULL OR trim(p_subdomain) = '' THEN
    RAISE EXCEPTION 'p_subdomain is required';
  END IF;
  RETURN QUERY
  SELECT o.id, o.tenant_id, t.subdomain, o.name,
    o.day_of_week, o.start_time, o.end_time, o.max_capacity,
    o.min_age, o.max_age, o.price_minor, o.currency, o.season_id,
    s.start_date, o.category_id, c.name, o.status,
    o.billing_mode, o.billing_interval, o.cover_image_path, o.updated_at,
    COALESCE(o.waiver_required, false), o.location
  FROM offerings o
  JOIN tenants t ON o.tenant_id = t.id
  LEFT JOIN seasons s ON s.id = o.season_id
  LEFT JOIN categories c ON c.id = o.category_id
  WHERE t.subdomain = trim(p_subdomain)
    AND o.is_public = true AND o.status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_offerings_by_subdomain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_public_offerings_by_subdomain(TEXT) TO authenticated;
