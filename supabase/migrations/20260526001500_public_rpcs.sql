-- =============================================================================
-- 015: Public RPCs
-- get_public_classes_by_subdomain — min_age/max_age read directly from classes table
-- get_tenant_config_by_subdomain  — branding + Stripe publishable key only (no secrets)
-- DEPENDENCIES: 001, 004
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Public class catalog
-- Returns active public classes for a subdomain.
-- min_age / max_age come directly from the classes table (typed INT, no JSONB cast).
-- Safe for anon callers on landing/enrolment pages.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_public_classes_by_subdomain(p_subdomain TEXT)
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
  term_id          UUID,
  level_id         UUID,
  level_name       TEXT,
  status           TEXT
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
    c.id,
    c.tenant_id,
    t.subdomain,
    c.name,
    c.day_of_week,
    c.start_time,
    c.end_time,
    c.max_capacity,
    c.min_age,
    c.max_age,
    c.price_minor,
    c.currency,
    c.term_id,
    c.level_id,
    l.name AS level_name,
    c.status
  FROM classes c
  JOIN tenants t ON c.tenant_id = t.id
  LEFT JOIN levels l ON l.id = c.level_id
  WHERE t.subdomain = trim(p_subdomain)
    AND c.is_public = true
    AND c.status    = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_classes_by_subdomain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_public_classes_by_subdomain(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Tenant branding / config (no secrets)
-- ---------------------------------------------------------------------------
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
