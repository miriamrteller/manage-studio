-- Hosted Supabase cannot set custom GUCs via ALTER DATABASE (permission denied).
-- Store the dev encryption key in a private table and resolve via get_app_encryption_key(),
-- which prefers the GUC when present (production runbook) and falls back to platform_config.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.platform_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON private.platform_config FROM PUBLIC;
REVOKE ALL ON private.platform_config FROM anon;
REVOKE ALL ON private.platform_config FROM authenticated;

-- Dev default (matches supabase/seed-finance.sql). Production: set app.encryption_key GUC or
-- UPDATE this row via a secured runbook step — never expose to clients.
INSERT INTO private.platform_config (key, value)
VALUES ('encryption_key', '0uT6CrQXiMJab+raSRxxx0j7ZLYvwKCb2HCoQusCfiY=')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION get_app_encryption_key()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public, extensions
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  enc_key := nullif(current_setting('app.encryption_key', true), '');
  IF enc_key IS NOT NULL THEN
    RETURN enc_key;
  END IF;

  SELECT value INTO enc_key
  FROM private.platform_config
  WHERE key = 'encryption_key'
  LIMIT 1;

  IF enc_key IS NULL OR enc_key = '' THEN
    RAISE EXCEPTION 'app.encryption_key is not configured';
  END IF;

  RETURN enc_key;
END;
$$;

REVOKE ALL ON FUNCTION get_app_encryption_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_app_encryption_key() FROM anon;
REVOKE ALL ON FUNCTION get_app_encryption_key() FROM authenticated;

-- Payment credential RPCs
CREATE OR REPLACE FUNCTION get_tenant_payment_credentials(p_tenant_id UUID)
RETURNS TABLE (
  payment_provider_public_key TEXT,
  payment_provider_secret_key TEXT,
  payment_provider_webhook_secret TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE enc_key TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_tenant_payment_credentials: service_role only';
  END IF;
  enc_key := get_app_encryption_key();
  RETURN QUERY SELECT
    t.payment_provider_public_key,
    CASE WHEN t.payment_provider_secret_enc  IS NOT NULL THEN pgp_sym_decrypt(t.payment_provider_secret_enc,  enc_key) ELSE NULL END,
    CASE WHEN t.payment_provider_webhook_enc IS NOT NULL THEN pgp_sym_decrypt(t.payment_provider_webhook_enc, enc_key) ELSE NULL END
  FROM tenants t WHERE t.id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_tenant_payment_credentials(
  p_public_key     TEXT,
  p_secret_key     TEXT,
  p_webhook_secret TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  enc_key     TEXT;
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND tenant_id = v_tenant_id AND 'tenant_admin' = ANY(role)) THEN
    RAISE EXCEPTION 'tenant_admin role required';
  END IF;
  enc_key := get_app_encryption_key();
  UPDATE tenants SET
    payment_provider_public_key   = NULLIF(trim(p_public_key), ''),
    payment_provider_secret_enc   = CASE WHEN p_secret_key     IS NOT NULL AND trim(p_secret_key)     <> '' THEN pgp_sym_encrypt(trim(p_secret_key),     enc_key) ELSE payment_provider_secret_enc   END,
    payment_provider_webhook_enc  = CASE WHEN p_webhook_secret IS NOT NULL AND trim(p_webhook_secret) <> '' THEN pgp_sym_encrypt(trim(p_webhook_secret), enc_key) ELSE payment_provider_webhook_enc  END,
    payment_provider_updated_at   = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

-- Invoicing credential RPCs
CREATE OR REPLACE FUNCTION get_tenant_invoicing_credentials(p_tenant_id UUID)
RETURNS TABLE (
  invoicing_account_id TEXT,
  invoicing_api_key    TEXT,
  invoicing_secret     TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE enc_key TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_tenant_invoicing_credentials: service_role only';
  END IF;
  enc_key := get_app_encryption_key();
  RETURN QUERY SELECT
    t.invoicing_account_id,
    CASE WHEN t.invoicing_api_key_enc IS NOT NULL THEN pgp_sym_decrypt(t.invoicing_api_key_enc, enc_key) ELSE NULL END,
    CASE WHEN t.invoicing_secret_enc     IS NOT NULL THEN pgp_sym_decrypt(t.invoicing_secret_enc,     enc_key) ELSE NULL END
  FROM tenants t WHERE t.id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_tenant_invoicing_credentials(
  p_account_id TEXT,
  p_api_key    TEXT,
  p_secret     TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  enc_key     TEXT;
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND tenant_id = v_tenant_id AND 'tenant_admin' = ANY(role)) THEN
    RAISE EXCEPTION 'tenant_admin role required';
  END IF;
  enc_key := get_app_encryption_key();
  UPDATE tenants SET
    invoicing_account_id           = NULLIF(trim(p_account_id), ''),
    invoicing_api_key_enc          = CASE WHEN p_api_key IS NOT NULL AND trim(p_api_key) <> '' THEN pgp_sym_encrypt(trim(p_api_key), enc_key) ELSE invoicing_api_key_enc END,
    invoicing_secret_enc           = CASE WHEN p_secret    IS NOT NULL AND trim(p_secret)    <> '' THEN pgp_sym_encrypt(trim(p_secret),    enc_key) ELSE invoicing_secret_enc     END,
    invoicing_credentials_updated_at = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

-- Grow credential RPC (G3)
CREATE OR REPLACE FUNCTION save_tenant_grow_credentials(
  p_user_id   TEXT,
  p_page_code TEXT,
  p_api_key   TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  enc_key     TEXT;
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND tenant_id = v_tenant_id AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'tenant_admin role required';
  END IF;
  enc_key := get_app_encryption_key();

  UPDATE tenants SET
    payment_provider             = 'grow',
    invoicing_provider           = 'grow',
    payment_provider_account_id  = NULLIF(trim(p_user_id), ''),
    payment_provider_public_key  = NULLIF(trim(p_page_code), ''),
    payment_provider_secret_enc  = CASE
      WHEN p_api_key IS NOT NULL AND trim(p_api_key) <> ''
      THEN pgp_sym_encrypt(trim(p_api_key), enc_key)
      ELSE payment_provider_secret_enc
    END,
    payment_provider_updated_at  = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;
