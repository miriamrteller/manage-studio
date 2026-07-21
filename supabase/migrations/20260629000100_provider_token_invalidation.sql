-- I4: revoke saved card tokens when switching bundled payment provider via credential RPC.

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

  UPDATE payment_method_tokens SET
    revoked_at = now(),
    is_default = false,
    updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND provider <> 'grow'
    AND revoked_at IS NULL;

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

CREATE OR REPLACE FUNCTION save_tenant_icount_credentials(
  p_company_id TEXT,
  p_page_id    TEXT,
  p_api_token  TEXT
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

  UPDATE payment_method_tokens SET
    revoked_at = now(),
    is_default = false,
    updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND provider <> 'icount'
    AND revoked_at IS NULL;

  UPDATE tenants SET
    payment_provider             = 'icount',
    invoicing_provider           = 'icount',
    payment_provider_account_id  = NULLIF(trim(p_company_id), ''),
    payment_provider_public_key  = NULLIF(trim(p_page_id), ''),
    payment_provider_secret_enc  = CASE
      WHEN p_api_token IS NOT NULL AND trim(p_api_token) <> ''
      THEN pgp_sym_encrypt(trim(p_api_token), enc_key)
      ELSE payment_provider_secret_enc
    END,
    payment_provider_updated_at  = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;
