-- =============================================================================
-- 20260709000100: Rapyd + Yesh Invoice — tenant columns & credential RPCs
-- Adds Rapyd sandbox flag, customer_id storage, and save/get RPCs for both
-- Rapyd (payment provider) and Yesh Invoice (invoicing provider).
--
-- Credential mapping on tenants:
--   Rapyd:
--     payment_provider_public_key  = access_key (non-secret identifier)
--     payment_provider_secret_enc  = secret_key (encrypted)
--     payment_provider_webhook_enc = webhook_secret (encrypted)
--     payment_provider_sandbox     = sandbox flag (new column)
--     payment_provider_customer_id = Rapyd customer_id for recurring (new column)
--   Yesh Invoice:
--     invoicing_account_id         = company_id
--     invoicing_api_key_enc        = api_key (encrypted)
--
-- DEPENDENCIES: 000200 (core_tenants), 001600 (finance — get_app_encryption_key)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- New columns on tenants
-- ---------------------------------------------------------------------------

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS payment_provider_sandbox     BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_provider_customer_id TEXT;

COMMENT ON COLUMN tenants.payment_provider_sandbox IS
  'When true, Rapyd adapter uses sandboxapi.rapyd.net; false = api.rapyd.net. Never mix credentials.';
COMMENT ON COLUMN tenants.payment_provider_customer_id IS
  'Rapyd customer.id for recurring billing. Set on first successful checkout and never re-created unless card changes.';

-- ---------------------------------------------------------------------------
-- RPC: save_tenant_rapyd_credentials
-- Tenant admin saves Rapyd access_key, secret_key, webhook_secret, sandbox flag.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_tenant_rapyd_credentials(
  p_access_key     TEXT,
  p_secret_key     TEXT,
  p_webhook_secret TEXT,
  p_sandbox        BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  enc_key     TEXT;
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND tenant_id = v_tenant_id
      AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'tenant_admin role required';
  END IF;

  enc_key := get_app_encryption_key();

  -- Revoke any tokens from prior providers (matches pattern of save_tenant_grow_credentials)
  UPDATE payment_method_tokens SET
    revoked_at = now(),
    is_default = false,
    updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND provider <> 'rapyd'
    AND revoked_at IS NULL;

  UPDATE tenants SET
    payment_provider              = 'rapyd',
    payment_provider_public_key   = NULLIF(trim(p_access_key), ''),
    payment_provider_secret_enc   = CASE
      WHEN p_secret_key IS NOT NULL AND trim(p_secret_key) <> ''
      THEN pgp_sym_encrypt(trim(p_secret_key), enc_key)
      ELSE payment_provider_secret_enc
    END,
    payment_provider_webhook_enc  = CASE
      WHEN p_webhook_secret IS NOT NULL AND trim(p_webhook_secret) <> ''
      THEN pgp_sym_encrypt(trim(p_webhook_secret), enc_key)
      ELSE payment_provider_webhook_enc
    END,
    payment_provider_sandbox      = p_sandbox,
    payment_provider_updated_at   = now(),
    updated_at                    = now()
  WHERE id = v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_tenant_rapyd_credentials(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: save_tenant_rapyd_customer_id
-- Service-role only — called by the Rapyd webhook handler after first checkout.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_tenant_rapyd_customer_id(
  p_tenant_id   UUID,
  p_customer_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'save_tenant_rapyd_customer_id: service_role only';
  END IF;
  UPDATE tenants SET
    payment_provider_customer_id = p_customer_id,
    updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_tenant_rapyd_customer_id(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: get_tenant_rapyd_credentials
-- Service-role only — returns decrypted Rapyd credentials.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_tenant_rapyd_credentials(p_tenant_id UUID)
RETURNS TABLE (
  access_key     TEXT,
  secret_key     TEXT,
  webhook_secret TEXT,
  sandbox        BOOLEAN,
  customer_id    TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE enc_key TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_tenant_rapyd_credentials: service_role only';
  END IF;
  enc_key := get_app_encryption_key();
  RETURN QUERY SELECT
    t.payment_provider_public_key,
    CASE WHEN t.payment_provider_secret_enc  IS NOT NULL THEN pgp_sym_decrypt(t.payment_provider_secret_enc,  enc_key) ELSE NULL END,
    CASE WHEN t.payment_provider_webhook_enc IS NOT NULL THEN pgp_sym_decrypt(t.payment_provider_webhook_enc, enc_key) ELSE NULL END,
    t.payment_provider_sandbox,
    t.payment_provider_customer_id
  FROM tenants t WHERE t.id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_tenant_rapyd_credentials(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: save_tenant_yesh_credentials
-- Tenant admin saves Yesh company_id (→ invoicing_account_id) and api_key.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_tenant_yesh_credentials(
  p_company_id TEXT,
  p_api_key    TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  enc_key     TEXT;
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND tenant_id = v_tenant_id
      AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'tenant_admin role required';
  END IF;

  enc_key := get_app_encryption_key();

  UPDATE tenants SET
    invoicing_provider               = 'yesh',
    invoicing_account_id             = NULLIF(trim(p_company_id), ''),
    invoicing_api_key_enc            = CASE
      WHEN p_api_key IS NOT NULL AND trim(p_api_key) <> ''
      THEN pgp_sym_encrypt(trim(p_api_key), enc_key)
      ELSE invoicing_api_key_enc
    END,
    invoicing_credentials_updated_at = now(),
    updated_at                       = now()
  WHERE id = v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_tenant_yesh_credentials(TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: get_tenant_yesh_credentials
-- Service-role only — returns decrypted Yesh credentials.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_tenant_yesh_credentials(p_tenant_id UUID)
RETURNS TABLE (
  company_id TEXT,
  api_key    TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE enc_key TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_tenant_yesh_credentials: service_role only';
  END IF;
  enc_key := get_app_encryption_key();
  RETURN QUERY SELECT
    t.invoicing_account_id,
    CASE WHEN t.invoicing_api_key_enc IS NOT NULL THEN pgp_sym_decrypt(t.invoicing_api_key_enc, enc_key) ELSE NULL END
  FROM tenants t WHERE t.id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_tenant_yesh_credentials(UUID) TO service_role;
