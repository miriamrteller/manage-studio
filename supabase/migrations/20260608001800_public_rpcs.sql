-- =============================================================================
-- 001800: Public RPCs (anon-safe)
-- get_public_offerings_by_subdomain — final signature with season_start_date,
--   cover_image_path, updated_at and waiver_required.
-- get_tenant_config_by_subdomain  — branding + preset + Stripe publishable key.
-- DEPENDENCIES: 000200, 000500
-- =============================================================================

CREATE OR REPLACE FUNCTION get_public_offerings_by_subdomain(p_subdomain TEXT)
RETURNS TABLE (
  id                UUID,
  tenant_id         UUID,
  tenant_subdomain  TEXT,
  name              TEXT,
  day_of_week       INT,
  start_time        TIME,
  end_time          TIME,
  max_capacity      INT,
  min_age           INT,
  max_age           INT,
  price_minor       INT,
  currency          TEXT,
  season_id         UUID,
  season_start_date DATE,
  category_id       UUID,
  category_name     TEXT,
  status            TEXT,
  billing_mode      TEXT,
  billing_interval  TEXT,
  cover_image_path  TEXT,
  updated_at        TIMESTAMPTZ,
  waiver_required   BOOLEAN
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
    s.start_date AS season_start_date,
    o.category_id,
    c.name AS category_name,
    o.status,
    o.billing_mode,
    o.billing_interval,
    o.cover_image_path,
    o.updated_at,
    COALESCE(o.waiver_required, false) AS waiver_required
  FROM offerings o
  JOIN tenants t ON o.tenant_id = t.id
  LEFT JOIN seasons s ON s.id = o.season_id
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
  id                            UUID,
  name                          TEXT,
  tenant_subdomain              TEXT,
  language_default              TEXT,
  country                       TEXT,
  currency                      TEXT,
  vat_rate                      NUMERIC,
  prices_include_vat            BOOLEAN,
  primary_color                 TEXT,
  accent_color                  TEXT,
  business_preset               TEXT,
  labels                        JSONB,
  stripe_publishable_key        TEXT,
  stripe_secret_configured      BOOLEAN,
  stripe_webhook_configured     BOOLEAN,
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
    t.prices_include_vat,
    t.primary_color,
    t.accent_color,
    t.business_preset,
    t.labels,
    t.stripe_publishable_key,
    (t.stripe_secret_key_enc     IS NOT NULL),
    (t.stripe_webhook_secret_enc IS NOT NULL),
    t.stripe_credentials_updated_at
  FROM tenants t
  WHERE t.subdomain = trim(p_subdomain)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO authenticated;
