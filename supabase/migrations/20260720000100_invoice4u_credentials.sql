-- =============================================================================
-- Invoice4U credential RPC (U1)
-- Atomic invoice4u/invoice4u bundled slugs (SPIKE-ADR D1, D4)
-- API key → secret_enc; clearing company type → public_key; optional account label
-- =============================================================================

CREATE OR REPLACE FUNCTION save_tenant_invoice4u_credentials(
  p_api_key               TEXT,
  p_clearing_company_type TEXT,
  p_account_label         TEXT DEFAULT NULL
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
  IF p_api_key IS NULL OR trim(p_api_key) = '' THEN
    RAISE EXCEPTION 'p_api_key is required';
  END IF;
  IF p_clearing_company_type IS NULL OR trim(p_clearing_company_type) = '' THEN
    RAISE EXCEPTION 'p_clearing_company_type is required';
  END IF;

  enc_key := get_app_encryption_key();

  UPDATE payment_method_tokens SET
    revoked_at = now(),
    is_default = false,
    updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND provider <> 'invoice4u'
    AND revoked_at IS NULL;

  UPDATE tenants SET
    payment_provider             = 'invoice4u',
    invoicing_provider           = 'invoice4u',
    payment_provider_account_id  = NULLIF(trim(p_account_label), ''),
    payment_provider_public_key  = NULLIF(trim(p_clearing_company_type), ''),
    payment_provider_secret_enc  = pgp_sym_encrypt(trim(p_api_key), enc_key),
    payment_provider_updated_at  = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_tenant_invoice4u_credentials(TEXT, TEXT, TEXT) TO authenticated;
