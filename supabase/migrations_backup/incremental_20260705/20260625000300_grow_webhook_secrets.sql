-- =============================================================================
-- 000300: Grow webhook secrets — per-tenant, encrypted, rotatable
-- GAP 4: Authenticates inbound Grow webhooks by comparing a pre-shared key
--        stored here against the webhookKey field Grow sends in every callback.
-- DEPENDENCIES: 000200 (get_app_encryption_key), 001600 (tenants)
-- =============================================================================

CREATE TABLE IF NOT EXISTS grow_webhook_secrets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  secret_enc   text        NOT NULL,    -- pgp_sym_encrypt'd with app encryption key
  key_version  integer     NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  rotated_at   timestamptz,
  expires_at   timestamptz,             -- populated on rotation to allow 24-hr overlap
  UNIQUE (tenant_id, key_version)
);

COMMENT ON TABLE  grow_webhook_secrets                IS 'Per-tenant Grow webhook pre-shared keys. Encrypted at rest. Rotate every 90 days.';
COMMENT ON COLUMN grow_webhook_secrets.secret_enc     IS 'AES-256 / pgp_sym_encrypt; decrypted only by get_grow_webhook_secret() SECURITY DEFINER.';
COMMENT ON COLUMN grow_webhook_secrets.key_version    IS 'Monotonically increasing; latest version is active unless expires_at has passed.';
COMMENT ON COLUMN grow_webhook_secrets.expires_at     IS 'During rotation, old key expires 24 h after new key is inserted. Both accepted until then.';

CREATE INDEX IF NOT EXISTS idx_grow_webhook_secrets_tenant
  ON grow_webhook_secrets (tenant_id);

-- ---------------------------------------------------------------------------
-- RPC: get_grow_webhook_secret — service_role only; decrypts and returns the
-- current active secret for a tenant. Called by GrowPaymentProvider.constructEvent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_grow_webhook_secret(p_tenant_id UUID)
RETURNS TABLE (webhook_secret TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  enc_key TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_grow_webhook_secret: service_role only';
  END IF;
  enc_key := get_app_encryption_key();
  RETURN QUERY
  SELECT pgp_sym_decrypt(s.secret_enc, enc_key)
  FROM grow_webhook_secrets s
  WHERE s.tenant_id = p_tenant_id
    AND (s.expires_at IS NULL OR s.expires_at > now())
  ORDER BY s.key_version DESC
  LIMIT 1;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: save_grow_webhook_secret — tenant_admin only; inserts a new version
-- and sets expires_at on the previous version to now() + 24 hours (overlap window).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_grow_webhook_secret(p_secret TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  enc_key     TEXT;
  v_tenant_id UUID;
  v_version   INT;
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

  enc_key := get_app_encryption_key();

  -- Compute next version number
  SELECT COALESCE(MAX(key_version), 0) + 1
    INTO v_version
  FROM grow_webhook_secrets
  WHERE tenant_id = v_tenant_id;

  -- Set 24-hour expiry on the currently active key (rotation overlap window)
  UPDATE grow_webhook_secrets
  SET expires_at = now() + interval '24 hours',
      rotated_at = now()
  WHERE tenant_id = v_tenant_id
    AND (expires_at IS NULL OR expires_at > now())
    AND key_version = v_version - 1;

  -- Insert the new key version
  INSERT INTO grow_webhook_secrets (tenant_id, secret_enc, key_version)
  VALUES (v_tenant_id, pgp_sym_encrypt(p_secret, enc_key), v_version);
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE grow_webhook_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY gws_super_admin ON grow_webhook_secrets
  FOR ALL USING (is_super_admin());

-- Admins can see their own tenant's rows (but secret_enc is encrypted — no plaintext exposed)
CREATE POLICY gws_tenant_admin_select ON grow_webhook_secrets
  FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND tenant_id = get_my_tenant_id()
        AND 'tenant_admin' = ANY(role)
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION get_grow_webhook_secret(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION save_grow_webhook_secret(TEXT) TO authenticated;
