-- Offline ("pay at the studio") payments for tenants with no online payment provider.
--
-- Why: the first production tenant is not a registered business yet. It takes cash
-- and bank transfers only, so the public enrolment checkout must offer "pay at the
-- studio" instead of a card form, and reminder emails must repeat the studio's own
-- payment instructions instead of linking to a checkout that cannot take money.
--
-- 1. tenants.payment_provider gains the app slug 'none' (validated in app/Zod, no
--    Postgres CHECK, as before). 'none' = no online capture; the admin records cash /
--    bank-transfer payments by hand (record-payment). Never use 'mock' for this.
-- 2. tenants.offline_payment_instructions: free text the studio writes (bank details,
--    opening hours, "pay the teacher at the first lesson"). Shown on the public
--    checkout, the confirmation screen and in payment reminders.
-- 3. get_tenant_config_by_subdomain returns the instructions (settings form + checkout).
--
-- Backward-compatible: one nullable column, one extra return column. No data rewrites.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS offline_payment_instructions TEXT;

COMMENT ON COLUMN tenants.payment_provider IS
  'Payment capture slug, validated in app/Zod. stripe|mock|grow|icount|invoice4u|ypay|tranzila|none. '
  '''none'' = no online payments: public checkout offers "pay at the studio" and the admin records '
  'cash / bank-transfer payments by hand. Never set ''mock'' on a real tenant.';
COMMENT ON COLUMN tenants.offline_payment_instructions IS
  'Studio-written instructions for paying at the studio (cash / bank transfer). Shown on the public '
  'checkout, the confirmation screen and in payment reminders when payment_provider = ''none''. '
  'Plain text; the studio writes it in its own language.';

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
    t.offline_payment_instructions
  FROM tenants t
  WHERE t.subdomain = trim(p_subdomain)
  LIMIT 1;
END;
$$;

-- Tier "public" in supabase/security/definer-execute.json (public tenant site).
REVOKE ALL ON FUNCTION get_tenant_config_by_subdomain(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_tenant_config_by_subdomain(TEXT) TO anon, authenticated, service_role;
