-- =============================================================================
-- 003600: Scheduling S3b — Google Calendar OAuth token storage
-- Encrypted refresh/access tokens on tenants (pgp_sym_encrypt + get_app_encryption_key,
-- mirroring payment credentials). Service-role RPCs for read/save/refresh/disconnect;
-- a tenant-scoped status RPC for the Connect UI.
-- DEPENDENCIES: 000200, 003400
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS google_calendar_refresh_token_enc BYTEA,
  ADD COLUMN IF NOT EXISTS google_calendar_access_token_enc  BYTEA,
  ADD COLUMN IF NOT EXISTS google_calendar_token_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_calendar_id                TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_email             TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_connected_at      TIMESTAMPTZ;

COMMENT ON COLUMN tenants.google_calendar_refresh_token_enc IS
  'pgp_sym_encrypt(refresh_token) — Google sends this once on first consent. Never expose to clients.';

-- Service-role read of decrypted Google credentials (Edge Functions only).
CREATE OR REPLACE FUNCTION get_tenant_google_credentials(p_tenant_id UUID)
RETURNS TABLE (
  refresh_token     TEXT,
  access_token      TEXT,
  token_expires_at  TIMESTAMPTZ,
  calendar_id       TEXT,
  email             TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  enc_key := get_app_encryption_key();
  RETURN QUERY SELECT
    CASE WHEN t.google_calendar_refresh_token_enc IS NOT NULL
      THEN pgp_sym_decrypt(t.google_calendar_refresh_token_enc, enc_key) ELSE NULL END,
    CASE WHEN t.google_calendar_access_token_enc IS NOT NULL
      THEN pgp_sym_decrypt(t.google_calendar_access_token_enc, enc_key) ELSE NULL END,
    t.google_calendar_token_expires_at,
    COALESCE(t.google_calendar_id, 'primary'),
    t.google_calendar_email
  FROM tenants t WHERE t.id = p_tenant_id;
END;
$$;

-- Persist tokens after OAuth code exchange. Preserves existing refresh token when
-- Google omits it on re-consent (only sent once).
CREATE OR REPLACE FUNCTION save_tenant_google_credentials(
  p_tenant_id     UUID,
  p_refresh_token TEXT,
  p_access_token  TEXT,
  p_expires_at    TIMESTAMPTZ,
  p_email         TEXT,
  p_calendar_id   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  enc_key := get_app_encryption_key();
  UPDATE tenants SET
    google_calendar_refresh_token_enc = CASE
      WHEN p_refresh_token IS NOT NULL AND trim(p_refresh_token) <> ''
      THEN pgp_sym_encrypt(trim(p_refresh_token), enc_key)
      ELSE google_calendar_refresh_token_enc END,
    google_calendar_access_token_enc = CASE
      WHEN p_access_token IS NOT NULL AND trim(p_access_token) <> ''
      THEN pgp_sym_encrypt(trim(p_access_token), enc_key)
      ELSE google_calendar_access_token_enc END,
    google_calendar_token_expires_at = COALESCE(p_expires_at, google_calendar_token_expires_at),
    google_calendar_email            = COALESCE(NULLIF(trim(p_email), ''), google_calendar_email),
    google_calendar_id               = COALESCE(NULLIF(trim(p_calendar_id), ''), google_calendar_id, 'primary'),
    google_calendar_connected_at     = COALESCE(google_calendar_connected_at, now()),
    updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

-- Cache a freshly refreshed access token.
CREATE OR REPLACE FUNCTION update_tenant_google_access_token(
  p_tenant_id    UUID,
  p_access_token TEXT,
  p_expires_at   TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  enc_key := get_app_encryption_key();
  UPDATE tenants SET
    google_calendar_access_token_enc = pgp_sym_encrypt(trim(p_access_token), enc_key),
    google_calendar_token_expires_at = p_expires_at,
    updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION disconnect_tenant_google_calendar(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tenants SET
    google_calendar_refresh_token_enc = NULL,
    google_calendar_access_token_enc  = NULL,
    google_calendar_token_expires_at  = NULL,
    google_calendar_email             = NULL,
    google_calendar_connected_at      = NULL,
    updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

-- Lock service-only functions to service_role.
REVOKE ALL ON FUNCTION get_tenant_google_credentials(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION save_tenant_google_credentials(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION update_tenant_google_access_token(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION disconnect_tenant_google_calendar(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_google_credentials(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION save_tenant_google_credentials(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION update_tenant_google_access_token(UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION disconnect_tenant_google_calendar(UUID) TO service_role;

-- Tenant-scoped connection status for the Connect UI (no secrets).
CREATE OR REPLACE FUNCTION get_google_calendar_connection()
RETURNS TABLE (
  connected BOOLEAN,
  email     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT (t.google_calendar_refresh_token_enc IS NOT NULL), t.google_calendar_email
  FROM tenants t WHERE t.id = v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_google_calendar_connection() TO authenticated;
