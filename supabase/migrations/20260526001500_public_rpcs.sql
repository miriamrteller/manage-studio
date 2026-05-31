-- =============================================================================
-- 015: Public RPCs
-- get_public_offerings_by_subdomain — min_age/max_age read directly from offerings table
-- get_tenant_config_by_subdomain  — branding + preset + Stripe publishable key only
-- DEPENDENCIES: 001, 004
-- =============================================================================

CREATE OR REPLACE FUNCTION get_public_offerings_by_subdomain(p_subdomain TEXT)
RETURNS TABLE (
  id               UUID,
  tenant_id        UUID,
  tenant_subdomain TEXT,
  name             TEXT,
  day_of_week      INT,
  start_time       TIME,
  end_time         TIME,
  max_capacity     INT,
  min_age          INT,
  max_age          INT,
  price_minor      INT,
  currency         TEXT,
  season_id        UUID,
  category_id      UUID,
  category_name    TEXT,
  status           TEXT,
  billing_mode     TEXT,
  billing_interval TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_subdomain IS NULL OR trim(p_subdomain) = '' THEN
    RAISE EXCEPTION 'p_subdomain is required';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.tenant_id,
    t.subdomain,
    o.name,
    o.day_of_week,
    o.start_time,
    o.end_time,
    o.max_capacity,
    o.min_age,
    o.max_age,
    o.price_minor,
    o.currency,
    o.season_id,
    o.category_id,
    c.name AS category_name,
    o.status,
    o.billing_mode,
    o.billing_interval
  FROM offerings o
  JOIN tenants t ON o.tenant_id = t.id
  LEFT JOIN categories c ON c.id = o.category_id
  WHERE t.subdomain = trim(p_subdomain)
    AND o.is_public = true
    AND o.status    = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_offerings_by_subdomain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_public_offerings_by_subdomain(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION get_tenant_config_by_subdomain(p_subdomain TEXT)
RETURNS TABLE (
  id                           UUID,
  name                         TEXT,
  tenant_subdomain             TEXT,
  language_default             TEXT,
  country                      TEXT,
  currency                     TEXT,
  vat_rate                     NUMERIC,
  primary_color                TEXT,
  accent_color                 TEXT,
  business_preset              TEXT,
  labels                       JSONB,
  stripe_publishable_key       TEXT,
  stripe_secret_configured     BOOLEAN,
  stripe_webhook_configured    BOOLEAN,
  stripe_credentials_updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_subdomain IS NULL OR trim(p_subdomain) = '' THEN
    RAISE EXCEPTION 'p_subdomain is required';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.subdomain,
    t.language_default,
    t.country,
    t.currency,
    t.vat_rate,
    t.primary_color,
    t.accent_color,
    t.business_preset,
    t.labels,
    t.stripe_publishable_key,
    (t.stripe_secret_key_enc      IS NOT NULL),
    (t.stripe_webhook_secret_enc  IS NOT NULL),
    t.stripe_credentials_updated_at
  FROM tenants t
  WHERE t.subdomain = trim(p_subdomain)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO authenticated;
