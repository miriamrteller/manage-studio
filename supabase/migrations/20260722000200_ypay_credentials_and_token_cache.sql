-- =============================================================================
-- YPay provider — credential RPC + access-token cache
--
-- YPay is a hosted-redirect payment gateway (UPAY-backed) that also issues the
-- bundled tax document, so a tenant on YPay uses payment_provider='ypay' AND
-- invoicing_provider='ypay' (same shape as Invoice4U).
--
-- Two credentials: client_id + client_secret (from YPay API registration).
--   client_id     → tenants.payment_provider_public_key   (identifier, not secret)
--   client_secret → tenants.payment_provider_secret_enc   (encrypted)
--
-- Token cache: YPay's accessToken is valid for one hour AND cannot be re-issued
-- while an active one exists (API error 3001, "already an active token for this
-- user"). So the bearer token MUST be cached and reused, not fetched per call.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Access-token cache, keyed per (tenant, provider) so it never collides with the
-- invoicing-side green_invoice cache (invoicing_token_cache).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_provider_token_cache (
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider    TEXT        NOT NULL,
  token       TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, provider)
);

COMMENT ON TABLE payment_provider_token_cache IS
  'Cached OAuth-style bearer tokens for payment providers whose auth endpoint rejects re-issuing an active token (e.g. YPay error 3001). Read/written by service_role in edge functions only.';

ALTER TABLE payment_provider_token_cache ENABLE ROW LEVEL SECURITY;
-- No policies: edge functions use the service role, which bypasses RLS. This table
-- holds provider session tokens and must never be reachable by anon/authenticated.

-- -----------------------------------------------------------------------------
-- save_tenant_ypay_credentials — mirrors save_tenant_invoice4u_credentials.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_tenant_ypay_credentials(
  p_client_id     TEXT,
  p_client_secret TEXT,
  p_account_label TEXT DEFAULT NULL
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
  IF p_client_id IS NULL OR trim(p_client_id) = '' THEN
    RAISE EXCEPTION 'p_client_id is required';
  END IF;
  IF p_client_secret IS NULL OR trim(p_client_secret) = '' THEN
    RAISE EXCEPTION 'p_client_secret is required';
  END IF;

  enc_key := get_app_encryption_key();

  -- Revoke saved cards from other providers — YPay has no tokenization, so any
  -- stored token would be unusable and must not be charged against.
  UPDATE payment_method_tokens SET
    revoked_at = now(),
    is_default = false,
    updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND provider <> 'ypay'
    AND revoked_at IS NULL;

  -- Switching credentials invalidates any cached access token.
  DELETE FROM payment_provider_token_cache
  WHERE tenant_id = v_tenant_id AND provider = 'ypay';

  UPDATE tenants SET
    payment_provider             = 'ypay',
    invoicing_provider           = 'ypay',
    payment_provider_account_id  = NULLIF(trim(p_account_label), ''),
    payment_provider_public_key  = trim(p_client_id),
    payment_provider_secret_enc  = pgp_sym_encrypt(trim(p_client_secret), enc_key),
    payment_provider_updated_at  = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_tenant_ypay_credentials(TEXT, TEXT, TEXT) TO authenticated;
