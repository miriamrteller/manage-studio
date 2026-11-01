-- =============================================================================
-- Tenant header/footer style and logo tone (Phase 2b of
-- docs/design/photographer-theme-proposal.md, T13 + T14)
--
-- chrome_style   'soft' (default: brand-tinted gradient header/footer) or
--                'solid' (header/footer filled with the brand colour).
-- logo_tone      Measured once per uploaded logo by the browser:
-- logo_dark_tone {"luminance": 0..1, "mono": bool, "hasPlate": bool, "aspect": number}.
--                NULL = not measured yet (the header then shows the logo on a
--                brand-colour pill, as it looked on the old solid header).
-- logo_autofix   false = always show the logo exactly as uploaded.
--
-- Additive only: new columns with defaults, no data rewrites, no seeds.
-- get_tenant_config_by_subdomain is redefined (return type grows), body
-- otherwise identical to 20260608002500.
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS chrome_style   TEXT    NOT NULL DEFAULT 'soft',
  ADD COLUMN IF NOT EXISTS logo_tone      JSONB,
  ADD COLUMN IF NOT EXISTS logo_dark_tone JSONB,
  ADD COLUMN IF NOT EXISTS logo_autofix   BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_chrome_style_check') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_chrome_style_check CHECK (chrome_style IN ('soft', 'solid'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_logo_tone_shape_check') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_logo_tone_shape_check CHECK (
        (logo_tone IS NULL OR jsonb_typeof(logo_tone) = 'object')
        AND (logo_dark_tone IS NULL OR jsonb_typeof(logo_dark_tone) = 'object')
      );
  END IF;
END $$;

COMMENT ON COLUMN tenants.chrome_style IS 'Header/footer style: soft (brand-tinted gradients, default) or solid (brand colour fill).';
COMMENT ON COLUMN tenants.logo_tone IS 'Measured tone of logo_url: {luminance, mono, hasPlate, aspect}; NULL = not measured.';
COMMENT ON COLUMN tenants.logo_dark_tone IS 'Measured tone of logo_dark_url: {luminance, mono, hasPlate, aspect}; NULL = not measured.';
COMMENT ON COLUMN tenants.logo_autofix IS 'false = show the logo exactly as uploaded on any header (no automatic contrast fix).';

DROP FUNCTION IF EXISTS get_tenant_config_by_subdomain(TEXT);

CREATE OR REPLACE FUNCTION get_tenant_config_by_subdomain(p_subdomain TEXT)
RETURNS TABLE (
  id                                UUID,
  name                              TEXT,
  tenant_subdomain                  TEXT,
  language_default                  TEXT,
  country                           TEXT,
  currency                          TEXT,
  primary_color                     TEXT,
  accent_color                      TEXT,
  plan                              tenant_plan,
  skin                              TEXT,
  labels                            JSONB,
  payment_provider                  TEXT,
  invoicing_provider                TEXT,
  payment_provider_public_key            TEXT,
  payment_provider_secret_configured     BOOLEAN,
  payment_provider_webhook_configured    BOOLEAN,
  payment_provider_updated_at            TIMESTAMPTZ,
  enabled_features                  TEXT[],
  font_pair                         TEXT,
  logo_url                          TEXT,
  logo_dark_url                     TEXT,
  chrome_style                      TEXT,
  logo_tone                         JSONB,
  logo_dark_tone                    JSONB,
  logo_autofix                      BOOLEAN
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
    t.primary_color,
    t.accent_color,
    t.plan,
    t.skin,
    t.labels,
    t.payment_provider,
    t.invoicing_provider,
    t.payment_provider_public_key,
    (t.payment_provider_secret_enc  IS NOT NULL),
    (t.payment_provider_webhook_enc IS NOT NULL),
    t.payment_provider_updated_at,
    get_tenant_features(t.id),
    t.font_pair,
    t.logo_url,
    t.logo_dark_url,
    t.chrome_style,
    t.logo_tone,
    t.logo_dark_tone,
    t.logo_autofix
  FROM tenants t
  WHERE t.subdomain = trim(p_subdomain)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO anon, authenticated;
