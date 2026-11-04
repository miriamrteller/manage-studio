-- =============================================================================
-- Photo shop: a studio's own SmugMug connection (owner decision 4 Nov: each photographer
-- uses her own SmugMug API key; there is no platform-wide key).
--
-- Five secrets, all pgp_sym_encrypt with the app key and never readable by the browser
-- (no column grant, the *_enc rule):
--   * smugmug_api_key_enc / smugmug_api_secret_enc: the studio's SmugMug API Key and Secret.
--   * smugmug_access_token_enc / smugmug_access_secret_enc: the OAuth 1.0a access token
--     SmugMug gives back after "Connect SmugMug".
--   * smugmug_oauth_pending_enc: the short-lived request token (and its secret) between
--     "Connect SmugMug" and SmugMug's callback, bound to the admin who started it.
-- Only the service role decrypts them (get_tenant_smugmug_credentials).
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS smugmug_api_key_enc BYTEA,
  ADD COLUMN IF NOT EXISTS smugmug_api_secret_enc BYTEA,
  ADD COLUMN IF NOT EXISTS smugmug_credentials_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS smugmug_access_token_enc BYTEA,
  ADD COLUMN IF NOT EXISTS smugmug_access_secret_enc BYTEA,
  ADD COLUMN IF NOT EXISTS smugmug_connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS smugmug_oauth_pending_enc BYTEA;

COMMENT ON COLUMN tenants.smugmug_api_key_enc IS
  'The studio''s own SmugMug API Key, pgp_sym_encrypt with get_app_encryption_key(). Set by save_tenant_smugmug_credentials.';
COMMENT ON COLUMN tenants.smugmug_api_secret_enc IS
  'SmugMug API Secret, pgp_sym_encrypt with get_app_encryption_key(). Decrypted only by get_tenant_smugmug_credentials (service role).';
COMMENT ON COLUMN tenants.smugmug_access_token_enc IS
  'SmugMug OAuth 1.0a access token (Access=Full, Permissions=Read), encrypted. Cleared by Disconnect or new API keys.';
COMMENT ON COLUMN tenants.smugmug_access_secret_enc IS
  'SmugMug OAuth 1.0a access token secret, encrypted. Cleared with the token.';
COMMENT ON COLUMN tenants.smugmug_oauth_pending_enc IS
  'Encrypted JSON {token, secret, uid, exp}: the request token while the admin is on SmugMug''s sign-in page.';

-- When the keys were saved and when SmugMug was connected are not secret (Settings shows them).
GRANT SELECT (smugmug_credentials_updated_at, smugmug_connected_at) ON TABLE tenants TO authenticated;

-- The signed-in studio admin's tenant, or an error.
CREATE OR REPLACE FUNCTION smugmug_admin_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION smugmug_admin_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION smugmug_admin_tenant_id() TO authenticated;

-- Studio admin saves (or replaces) the studio's SmugMug API Key and Secret. A new key pair
-- also ends any existing connection: an access token belongs to the key it was made with.
CREATE OR REPLACE FUNCTION save_tenant_smugmug_credentials(
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
  v_tenant_id := smugmug_admin_tenant_id();
  IF p_api_key IS NULL OR btrim(p_api_key) = '' THEN
    RAISE EXCEPTION 'p_api_key is required';
  END IF;
  IF p_api_secret IS NULL OR btrim(p_api_secret) = '' THEN
    RAISE EXCEPTION 'p_api_secret is required';
  END IF;

  UPDATE tenants SET
    smugmug_api_key_enc            = pgp_sym_encrypt(btrim(p_api_key), get_app_encryption_key()),
    smugmug_api_secret_enc         = pgp_sym_encrypt(btrim(p_api_secret), get_app_encryption_key()),
    smugmug_credentials_updated_at = now(),
    smugmug_access_token_enc       = NULL,
    smugmug_access_secret_enc      = NULL,
    smugmug_connected_at           = NULL,
    smugmug_oauth_pending_enc      = NULL,
    updated_at                     = now()
  WHERE id = v_tenant_id;

  -- Who changed the keys, never the keys themselves.
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_tenant_id, auth.uid(), 'UPDATE', 'smugmug_credentials', v_tenant_id,
          jsonb_build_object('api_key_last4', right(btrim(p_api_key), 4)));
END;
$$;

REVOKE ALL ON FUNCTION save_tenant_smugmug_credentials(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_tenant_smugmug_credentials(TEXT, TEXT) TO authenticated;

-- Disconnect: clears the access token and its secret. The API keys stay, so the studio can
-- connect again with one press.
CREATE OR REPLACE FUNCTION disconnect_tenant_smugmug()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  v_tenant_id := smugmug_admin_tenant_id();
  UPDATE tenants SET
    smugmug_access_token_enc  = NULL,
    smugmug_access_secret_enc = NULL,
    smugmug_connected_at      = NULL,
    smugmug_oauth_pending_enc = NULL,
    updated_at                = now()
  WHERE id = v_tenant_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_tenant_id, auth.uid(), 'UPDATE', 'smugmug_connection', v_tenant_id,
          jsonb_build_object('connected', false));
END;
$$;

REVOKE ALL ON FUNCTION disconnect_tenant_smugmug() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION disconnect_tenant_smugmug() TO authenticated;

-- Settings: has the studio saved keys, and is SmugMug connected? Yes/no only, admins only.
CREATE OR REPLACE FUNCTION tenant_smugmug_status()
RETURNS TABLE (has_keys BOOLEAN, connected BOOLEAN, keys_updated_at TIMESTAMPTZ, connected_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.smugmug_api_key_enc IS NOT NULL AND t.smugmug_api_secret_enc IS NOT NULL,
         t.smugmug_access_token_enc IS NOT NULL AND t.smugmug_access_secret_enc IS NOT NULL,
         t.smugmug_credentials_updated_at,
         t.smugmug_connected_at
  FROM tenants t
  JOIN user_profiles up ON up.tenant_id = t.id AND up.id = auth.uid() AND 'tenant_admin' = ANY(up.role);
$$;

REVOKE ALL ON FUNCTION tenant_smugmug_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tenant_smugmug_status() TO authenticated;

-- Edge Functions only: everything decrypted. Empty when no keys are saved.
CREATE OR REPLACE FUNCTION get_tenant_smugmug_credentials(p_tenant_id UUID)
RETURNS TABLE (api_key TEXT, api_secret TEXT, access_token TEXT, access_secret TEXT, oauth_pending TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_tenant_smugmug_credentials: service_role only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT pgp_sym_decrypt(t.smugmug_api_key_enc, get_app_encryption_key()),
         pgp_sym_decrypt(t.smugmug_api_secret_enc, get_app_encryption_key()),
         CASE WHEN t.smugmug_access_token_enc IS NULL THEN NULL
              ELSE pgp_sym_decrypt(t.smugmug_access_token_enc, get_app_encryption_key()) END,
         CASE WHEN t.smugmug_access_secret_enc IS NULL THEN NULL
              ELSE pgp_sym_decrypt(t.smugmug_access_secret_enc, get_app_encryption_key()) END,
         CASE WHEN t.smugmug_oauth_pending_enc IS NULL THEN NULL
              ELSE pgp_sym_decrypt(t.smugmug_oauth_pending_enc, get_app_encryption_key()) END
  FROM tenants t
  WHERE t.id = p_tenant_id
    AND t.smugmug_api_key_enc IS NOT NULL
    AND t.smugmug_api_secret_enc IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION get_tenant_smugmug_credentials(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_smugmug_credentials(UUID) TO service_role;

-- Edge Functions only: remember the request token while the admin is on SmugMug (NULL clears it).
CREATE OR REPLACE FUNCTION set_tenant_smugmug_oauth_pending(p_tenant_id UUID, p_pending TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'set_tenant_smugmug_oauth_pending: service_role only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE tenants SET
    smugmug_oauth_pending_enc = CASE WHEN p_pending IS NULL THEN NULL
                                     ELSE pgp_sym_encrypt(p_pending, get_app_encryption_key()) END
  WHERE id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION set_tenant_smugmug_oauth_pending(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_tenant_smugmug_oauth_pending(UUID, TEXT) TO service_role;

-- Edge Functions only: store the access token SmugMug gave back, and forget the request token.
CREATE OR REPLACE FUNCTION save_tenant_smugmug_access_token(
  p_tenant_id     UUID,
  p_actor_id      UUID,
  p_access_token  TEXT,
  p_access_secret TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'save_tenant_smugmug_access_token: service_role only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_access_token IS NULL OR btrim(p_access_token) = '' OR p_access_secret IS NULL OR btrim(p_access_secret) = '' THEN
    RAISE EXCEPTION 'access token and secret are required';
  END IF;
  UPDATE tenants SET
    smugmug_access_token_enc  = pgp_sym_encrypt(btrim(p_access_token), get_app_encryption_key()),
    smugmug_access_secret_enc = pgp_sym_encrypt(btrim(p_access_secret), get_app_encryption_key()),
    smugmug_connected_at      = now(),
    smugmug_oauth_pending_enc = NULL,
    updated_at                = now()
  WHERE id = p_tenant_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (p_tenant_id, p_actor_id, 'UPDATE', 'smugmug_connection', p_tenant_id,
          jsonb_build_object('connected', true));
END;
$$;

REVOKE ALL ON FUNCTION save_tenant_smugmug_access_token(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION save_tenant_smugmug_access_token(UUID, UUID, TEXT, TEXT) TO service_role;
