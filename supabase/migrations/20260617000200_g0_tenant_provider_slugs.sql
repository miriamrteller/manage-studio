-- G0: Expose payment/invoicing provider slugs on public tenant config (no secrets).

-- Adding columns changes the function's return type, which CREATE OR REPLACE cannot do; drop first.
DROP FUNCTION IF EXISTS get_tenant_config_by_subdomain(TEXT);

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
  payment_provider              TEXT,
  invoicing_provider            TEXT,
  payment_provider_public_key        TEXT,
  payment_provider_secret_configured BOOLEAN,
  payment_provider_webhook_configured BOOLEAN,
  payment_provider_updated_at        TIMESTAMPTZ
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
    t.payment_provider,
    t.invoicing_provider,
    t.payment_provider_public_key,
    (t.payment_provider_secret_enc  IS NOT NULL),
    (t.payment_provider_webhook_enc IS NOT NULL),
    t.payment_provider_updated_at
  FROM tenants t
  WHERE t.subdomain = trim(p_subdomain)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO authenticated;
