-- =============================================================================
-- Takbull, PR 1 (docs/plans/TAKBULL-INTEGRATION.md): a studio's own Takbull keys.
--
-- Takbull authenticates every call with an API_Key + API_Secret pair per merchant. They
-- get their own columns rather than the shared payment_provider_* ones: saving Takbull keys
-- must never overwrite a live studio's Grow / YPay keys or switch its provider. Choosing
-- Takbull as the provider is a later, separate step (hidden until the integration is done).
--
-- Both halves of the pair are encrypted with the app key (pgp_sym_encrypt, like every other
-- provider secret) and are never readable by the browser: no column grant (the *_enc rule),
-- and only the service role can decrypt them (get_tenant_takbull_credentials).
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS takbull_api_key_enc BYTEA,
  ADD COLUMN IF NOT EXISTS takbull_api_secret_enc BYTEA,
  ADD COLUMN IF NOT EXISTS takbull_credentials_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN tenants.takbull_api_key_enc IS
  'Takbull API_Key of the studio''s own Takbull merchant account, pgp_sym_encrypt with get_app_encryption_key(). Set by save_tenant_takbull_credentials.';
COMMENT ON COLUMN tenants.takbull_api_secret_enc IS
  'Takbull API_Secret, pgp_sym_encrypt with get_app_encryption_key(). Decrypted only by get_tenant_takbull_credentials (service role).';

-- When the keys were last changed is not secret (Settings may show it).
GRANT SELECT (takbull_credentials_updated_at) ON TABLE tenants TO authenticated;

-- Studio admin saves (or replaces) the studio's Takbull keys. Does not change the provider.
CREATE OR REPLACE FUNCTION save_tenant_takbull_credentials(
  p_api_key    TEXT,
  p_api_secret TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND tenant_id = v_tenant_id AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'tenant_admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_api_key IS NULL OR btrim(p_api_key) = '' THEN
    RAISE EXCEPTION 'p_api_key is required';
  END IF;
  IF p_api_secret IS NULL OR btrim(p_api_secret) = '' THEN
    RAISE EXCEPTION 'p_api_secret is required';
  END IF;

  UPDATE tenants SET
    takbull_api_key_enc            = pgp_sym_encrypt(btrim(p_api_key), get_app_encryption_key()),
    takbull_api_secret_enc         = pgp_sym_encrypt(btrim(p_api_secret), get_app_encryption_key()),
    takbull_credentials_updated_at = now(),
    updated_at                     = now()
  WHERE id = v_tenant_id;

  -- Who changed the keys, never the keys themselves.
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_tenant_id, auth.uid(), 'UPDATE', 'takbull_credentials', v_tenant_id,
          jsonb_build_object('api_key_last4', right(btrim(p_api_key), 4)));
END;
$$;

REVOKE ALL ON FUNCTION save_tenant_takbull_credentials(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_tenant_takbull_credentials(TEXT, TEXT) TO authenticated;

-- Edge Functions only: the studio's keys, secret decrypted. Empty when none are saved.
CREATE OR REPLACE FUNCTION get_tenant_takbull_credentials(p_tenant_id UUID)
RETURNS TABLE (api_key TEXT, api_secret TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_tenant_takbull_credentials: service_role only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT pgp_sym_decrypt(t.takbull_api_key_enc, get_app_encryption_key()),
         pgp_sym_decrypt(t.takbull_api_secret_enc, get_app_encryption_key())
  FROM tenants t
  WHERE t.id = p_tenant_id
    AND t.takbull_api_key_enc IS NOT NULL
    AND t.takbull_api_secret_enc IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION get_tenant_takbull_credentials(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_takbull_credentials(UUID) TO service_role;

-- Settings shows "connected" without ever reading the key: a yes/no for the studio's admins.
CREATE OR REPLACE FUNCTION tenant_takbull_connected()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenants t
    JOIN user_profiles up ON up.tenant_id = t.id AND up.id = auth.uid() AND 'tenant_admin' = ANY(up.role)
    WHERE t.takbull_api_key_enc IS NOT NULL AND t.takbull_api_secret_enc IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION tenant_takbull_connected() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tenant_takbull_connected() TO authenticated;
