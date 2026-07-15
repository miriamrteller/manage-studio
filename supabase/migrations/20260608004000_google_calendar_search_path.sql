-- Google Calendar credential RPCs need extensions schema for pgp_sym_encrypt/decrypt
-- (Supabase installs pgcrypto in extensions, not public).

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
