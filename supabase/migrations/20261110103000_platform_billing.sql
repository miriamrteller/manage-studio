-- =============================================================================
-- OpalSwift's own billing of studios, step B1 (docs/plans/TAKBULL-INTEGRATION.md,
-- "OpalSwift's own billing of studios"). Nothing here charges anyone yet.
--
-- * platform_billing_settings: one row. OpalSwift's own Takbull keys (encrypted with the app
--   key, like a studio's keys) and the master switch for charging studios (off).
-- * studio_subscriptions: one row per studio once it has billing details (saved card, next
--   charge date, failed attempts). Its status stays tenants.sub_status.
-- * platform_payments: one row per monthly charge attempt; a studio can have only one
--   successful charge per month.
--
-- All three are platform-only: the platform owner (super_admin) reads them, only the service
-- role writes them, and no browser role can read an *_enc column.
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform_billing_settings (
  id                             BOOLEAN     PRIMARY KEY DEFAULT true CHECK (id),
  takbull_api_key_enc            BYTEA,
  takbull_api_secret_enc         BYTEA,
  takbull_credentials_updated_at TIMESTAMPTZ,
  takbull_credentials_updated_by UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  -- Master switch for the monthly charge job (step B3). Off until the owner launches billing.
  charging_enabled               BOOLEAN     NOT NULL DEFAULT false,
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE platform_billing_settings IS
  'One row: OpalSwift''s own Takbull merchant keys (pgp_sym_encrypt, app key) and the charging switch. Platform-only.';
INSERT INTO platform_billing_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_platform_billing_settings_updated_by
  ON platform_billing_settings (takbull_credentials_updated_by);

ALTER TABLE platform_billing_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_billing_settings FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS studio_subscriptions (
  tenant_id            UUID        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  -- Monthly price in agorot, set by the platform owner (prices are not confirmed, so no default).
  monthly_amount_agorot INT        CHECK (monthly_amount_agorot IS NULL OR monthly_amount_agorot > 0),
  founder              BOOLEAN     NOT NULL DEFAULT false,
  -- No charge before this date (founders: 2027-01-01).
  free_until           DATE,
  next_charge_on       DATE,
  -- The saved card: Takbull token (encrypted) and what the studio may see of it.
  card_token_enc       BYTEA,
  card_last4           TEXT        CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  card_expiry          TEXT        CHECK (card_expiry IS NULL OR card_expiry ~ '^[0-9]{2}/[0-9]{2}$'),
  card_saved_at        TIMESTAMPTZ,
  failed_attempts      INT         NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  last_failed_at       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE studio_subscriptions IS
  'OpalSwift''s billing details per studio (card token, next charge, failed attempts). Status is tenants.sub_status. Platform-only.';
COMMENT ON COLUMN studio_subscriptions.card_token_enc IS
  'Takbull card token (CardExternalToken), pgp_sym_encrypt with get_app_encryption_key(). Service role only.';

ALTER TABLE studio_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON studio_subscriptions FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS platform_payments (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- The month paid for, as its first day.
  period_month           DATE        NOT NULL CHECK (period_month = date_trunc('month', period_month)::date),
  attempt                INT         NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  amount_agorot          INT         NOT NULL CHECK (amount_agorot > 0),
  status                 TEXT        NOT NULL DEFAULT 'pending'
                                     CHECK (status IN ('pending', 'succeeded', 'failed')),
  takbull_order_ref      TEXT,
  takbull_transaction_id TEXT,
  document_url           TEXT,
  error_code             TEXT,
  error_message          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_month, attempt)
);
COMMENT ON TABLE platform_payments IS
  'Each monthly charge attempt OpalSwift makes on a studio''s saved card. Platform-only.';
-- A rerun can never charge the same month twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_payments_one_success
  ON platform_payments (tenant_id, period_month) WHERE status = 'succeeded';

ALTER TABLE platform_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_payments FROM PUBLIC, anon, authenticated;

-- Edge Functions only: OpalSwift's keys, decrypted. Empty when none are saved.
CREATE OR REPLACE FUNCTION get_platform_takbull_credentials()
RETURNS TABLE (api_key TEXT, api_secret TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_platform_takbull_credentials: service_role only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT pgp_sym_decrypt(s.takbull_api_key_enc, get_app_encryption_key()),
         pgp_sym_decrypt(s.takbull_api_secret_enc, get_app_encryption_key())
  FROM platform_billing_settings s
  WHERE s.takbull_api_key_enc IS NOT NULL
    AND s.takbull_api_secret_enc IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION get_platform_takbull_credentials() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_platform_takbull_credentials() TO service_role;

-- The platform owner saves (or replaces) OpalSwift's keys.
CREATE OR REPLACE FUNCTION save_platform_takbull_credentials(
  p_api_key    TEXT,
  p_api_secret TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT coalesce(is_super_admin(), false) THEN
    RAISE EXCEPTION 'platform owner only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_api_key IS NULL OR btrim(p_api_key) = '' THEN
    RAISE EXCEPTION 'p_api_key is required';
  END IF;
  IF p_api_secret IS NULL OR btrim(p_api_secret) = '' THEN
    RAISE EXCEPTION 'p_api_secret is required';
  END IF;
  UPDATE platform_billing_settings SET
    takbull_api_key_enc            = pgp_sym_encrypt(btrim(p_api_key), get_app_encryption_key()),
    takbull_api_secret_enc         = pgp_sym_encrypt(btrim(p_api_secret), get_app_encryption_key()),
    takbull_credentials_updated_at = now(),
    takbull_credentials_updated_by = auth.uid(),
    updated_at                     = now()
  WHERE id;
END;
$$;
REVOKE ALL ON FUNCTION save_platform_takbull_credentials(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_platform_takbull_credentials(TEXT, TEXT) TO authenticated;

-- Platform → Billing: whether OpalSwift's keys are saved and charging is on (never the keys).
CREATE OR REPLACE FUNCTION platform_billing_status()
RETURNS TABLE (keys_saved BOOLEAN, keys_saved_at TIMESTAMPTZ, charging_enabled BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT coalesce(is_super_admin(), false) THEN
    RAISE EXCEPTION 'platform owner only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT (s.takbull_api_key_enc IS NOT NULL AND s.takbull_api_secret_enc IS NOT NULL),
         CASE WHEN s.takbull_api_key_enc IS NOT NULL AND s.takbull_api_secret_enc IS NOT NULL
              THEN s.takbull_credentials_updated_at END,
         s.charging_enabled
  FROM platform_billing_settings s;
END;
$$;
REVOKE ALL ON FUNCTION platform_billing_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_billing_status() TO authenticated;

-- Platform → Billing: every studio with its plan status and billing details (no token).
CREATE OR REPLACE FUNCTION platform_billing_overview()
RETURNS TABLE (
  tenant_id             UUID,
  name                  TEXT,
  subdomain             TEXT,
  sub_status            TEXT,
  trial_ends_at         TIMESTAMPTZ,
  founder               BOOLEAN,
  free_until            DATE,
  monthly_amount_agorot INT,
  next_charge_on        DATE,
  card_last4            TEXT,
  failed_attempts       INT,
  last_paid_month       DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT coalesce(is_super_admin(), false) THEN
    RAISE EXCEPTION 'platform owner only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT t.id, t.name, t.subdomain, t.sub_status, t.trial_ends_at,
         coalesce(s.founder, false), s.free_until, s.monthly_amount_agorot, s.next_charge_on,
         s.card_last4, coalesce(s.failed_attempts, 0),
         (SELECT max(p.period_month) FROM platform_payments p
          WHERE p.tenant_id = t.id AND p.status = 'succeeded')
  FROM tenants t
  LEFT JOIN studio_subscriptions s ON s.tenant_id = t.id
  ORDER BY t.name;
END;
$$;
REVOKE ALL ON FUNCTION platform_billing_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_billing_overview() TO authenticated;
