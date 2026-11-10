-- =============================================================================
-- Takbull PR 7 (docs/plans/TAKBULL-INTEGRATION.md, item 8): a studio opens its own Takbull
-- account from Settings → Payments (dev website only). OpalSwift's keys call CreateAccount;
-- the new account's keys come back and are saved here, encrypted.
--
-- * tenants.takbull_merchant_id / takbull_account_opened_at: which Takbull account was
--   opened for the studio, and when (not secret).
-- * platform_billing_settings.takbull_child_package_id: the Takbull package new studio
--   accounts get (empty = Takbull's free package). Set by the platform owner.
-- * save_opened_takbull_account (service role): saves the keys encrypted and switches the
--   studio's payments and invoicing to Takbull.
-- The owner's password, ID number and bank details are never stored: they go to Takbull only.
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS takbull_merchant_id TEXT,
  ADD COLUMN IF NOT EXISTS takbull_account_opened_at TIMESTAMPTZ;
COMMENT ON COLUMN tenants.takbull_merchant_id IS
  'The Takbull child merchant id (MID) OpalSwift opened for the studio (CreateAccount). Not secret.';
COMMENT ON COLUMN tenants.takbull_account_opened_at IS
  'When OpalSwift opened the studio''s Takbull account. One account per studio.';
GRANT SELECT (takbull_merchant_id, takbull_account_opened_at) ON TABLE tenants TO authenticated;

ALTER TABLE platform_billing_settings
  ADD COLUMN IF NOT EXISTS takbull_child_package_id TEXT;
COMMENT ON COLUMN platform_billing_settings.takbull_child_package_id IS
  'Takbull PackageUniqId for studio accounts OpalSwift opens (OpalSwift pays). Empty: the free package.';

-- Edge Functions only: save the opened account's keys and switch the studio to Takbull.
CREATE OR REPLACE FUNCTION save_opened_takbull_account(
  p_tenant_id   UUID,
  p_actor_id    UUID,
  p_api_key     TEXT,
  p_api_secret  TEXT,
  p_merchant_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'save_opened_takbull_account: service_role only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_api_key IS NULL OR btrim(p_api_key) = '' OR p_api_secret IS NULL OR btrim(p_api_secret) = '' THEN
    RAISE EXCEPTION 'p_api_key and p_api_secret are required';
  END IF;
  UPDATE tenants SET
    takbull_api_key_enc            = pgp_sym_encrypt(btrim(p_api_key), get_app_encryption_key()),
    takbull_api_secret_enc         = pgp_sym_encrypt(btrim(p_api_secret), get_app_encryption_key()),
    takbull_credentials_updated_at = now(),
    takbull_merchant_id            = nullif(btrim(coalesce(p_merchant_id, '')), ''),
    takbull_account_opened_at      = now(),
    payment_provider               = 'takbull',
    invoicing_provider             = 'takbull',
    updated_at                     = now()
  WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'studio not found';
  END IF;
  -- Who opened it and which account, never the keys.
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (p_tenant_id, p_actor_id, 'CREATE', 'takbull_account', p_tenant_id,
          jsonb_build_object('merchant_id', p_merchant_id, 'api_key_last4', right(btrim(p_api_key), 4)));
END;
$$;
REVOKE ALL ON FUNCTION save_opened_takbull_account(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION save_opened_takbull_account(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

-- Platform → Billing: the package new studio accounts get (empty = the free package).
CREATE OR REPLACE FUNCTION set_platform_child_package(p_package_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT coalesce(is_super_admin(), false) THEN
    RAISE EXCEPTION 'platform owner only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE platform_billing_settings
     SET takbull_child_package_id = nullif(btrim(coalesce(p_package_id, '')), ''), updated_at = now()
   WHERE id;
END;
$$;
REVOKE ALL ON FUNCTION set_platform_child_package(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_platform_child_package(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION platform_child_package()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v TEXT;
BEGIN
  IF NOT coalesce(is_super_admin(), false) THEN
    RAISE EXCEPTION 'platform owner only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT takbull_child_package_id INTO v FROM platform_billing_settings WHERE id;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION platform_child_package() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_child_package() TO authenticated;
