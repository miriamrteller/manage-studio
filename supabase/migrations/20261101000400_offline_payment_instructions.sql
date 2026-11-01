-- Pay-at-the-studio follow-up (after 20261101000100 / #114).
--
-- tenants.offline_payment_instructions: the studio's own text for parents who pay at the
-- studio (bank details, "pay the teacher at the first lesson", opening hours). Shown in
-- the public "Pay at the studio" notice and in the day-14 / day-25 reminder emails of
-- tenants with payment_provider = 'offline'. Editable in Admin → Setup → Settings.
--
-- get_tenant_config_by_subdomain is redefined (return type grows); body otherwise
-- identical to 20261101000200.
--
-- Backward-compatible: one nullable column, one extra return column. No data rewrites.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS offline_payment_instructions TEXT;

COMMENT ON COLUMN tenants.offline_payment_instructions IS
  'Studio-written instructions for paying at the studio (cash / bank transfer). Shown on the public '
  'checkout notice and in payment reminders when payment_provider = ''offline''. Plain text, the '
  'studio writes it in its own language. NULL = generic wording.';

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
  logo_autofix                      BOOLEAN,
  privacy_policy_url                TEXT,
  terms_url                         TEXT,
  accessibility_statement_url       TEXT,
  offline_payment_instructions      TEXT
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
    t.logo_autofix,
    t.privacy_policy_url,
    t.terms_url,
    t.accessibility_statement_url,
    t.offline_payment_instructions
  FROM tenants t
  WHERE t.subdomain = trim(p_subdomain)
  LIMIT 1;
END;
$$;

-- Tier "public" in supabase/security/definer-execute.json (public tenant site).
REVOKE ALL ON FUNCTION get_tenant_config_by_subdomain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO anon, authenticated, service_role;
