-- =============================================================================
-- iCount credential + webhook RPCs (I1)
-- Atomic icount/icount bundled slugs; webhook secret on tenants.payment_provider_webhook_enc
-- =============================================================================

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

CREATE OR REPLACE FUNCTION save_icount_webhook_secret(p_secret TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  enc_key     TEXT;
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND tenant_id = v_tenant_id
      AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'tenant_admin role required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenants
    WHERE id = v_tenant_id
      AND payment_provider = 'icount'
      AND invoicing_provider = 'icount'
  ) THEN
    RAISE EXCEPTION 'Tenant must use icount/icount bundled providers';
  END IF;

  enc_key := get_app_encryption_key();

  UPDATE tenants SET
    payment_provider_webhook_enc = CASE
      WHEN p_secret IS NOT NULL AND trim(p_secret) <> ''
      THEN pgp_sym_encrypt(trim(p_secret), enc_key)
      ELSE payment_provider_webhook_enc
    END,
    payment_provider_updated_at = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_tenant_icount_credentials(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION save_icount_webhook_secret(TEXT) TO authenticated;
