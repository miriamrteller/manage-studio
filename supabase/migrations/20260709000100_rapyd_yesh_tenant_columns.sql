-- =============================================================================
-- Migration: 20260709000100_rapyd_yesh_tenant_columns.sql
-- Purpose:   Add Rapyd + Yesh provider columns to tenant_configs and create
--            helper RPCs for credential management.
-- Rule:      Additive only — no DROP, no column rename, no data migration.
-- PA-2:      secret_key_ref (vault reference) not secret_key (plaintext).
-- =============================================================================

-- ── 1. Provider selector columns ─────────────────────────────────────────────

ALTER TABLE tenant_configs
  ADD COLUMN IF NOT EXISTS payment_provider TEXT
    CHECK (payment_provider IN ('rapyd', 'icount_paypage', 'grow')),
  ADD COLUMN IF NOT EXISTS invoicing_provider TEXT
    CHECK (invoicing_provider IN ('yesh', 'icount'));

-- ── 2. Provider config JSONB columns ─────────────────────────────────────────
-- rapyd_config shape: {
--   access_key: string,          -- non-sensitive, stored in DB
--   secret_key_ref: string,      -- vault reference: "vault:secret/tenants/{id}/rapyd#secret_key"
--   sandbox: boolean,
--   customer_id?: string         -- Rapyd customer ID for recurring tenants
-- }
-- yesh_config shape: {
--   api_key_ref: string,         -- vault reference: "vault:secret/tenants/{id}/yesh#api_key"
--   company_id: string           -- Yesh business ID (non-sensitive)
-- }

ALTER TABLE tenant_configs
  ADD COLUMN IF NOT EXISTS rapyd_config  JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS yesh_config   JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_provider_sandbox BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 3. Indexes for webhook tenant lookup (O(log n) access_key resolution) ────

CREATE INDEX IF NOT EXISTS idx_tenant_configs_rapyd_access_key
  ON tenant_configs USING GIN ((rapyd_config->>'access_key'));

CREATE INDEX IF NOT EXISTS idx_tenant_configs_active
  ON tenant_configs (is_active)
  WHERE is_active = true;

-- ── 4. Default Creative Ballet Studios to Rapyd + Yesh ───────────────────────
-- Only update rows that have no provider set (safe on repeated runs).

UPDATE tenant_configs
SET
  payment_provider   = 'rapyd',
  invoicing_provider = 'yesh'
WHERE
  payment_provider   IS NULL
  AND invoicing_provider IS NULL;

-- ── 5. RPCs — credential management ─────────────────────────────────────────
-- These functions are the only allowed write path for provider config.
-- They enforce that secret_key_ref (not plaintext) is always stored.

CREATE OR REPLACE FUNCTION save_tenant_rapyd_credentials(
  p_tenant_id   UUID,
  p_access_key  TEXT,
  p_secret_ref  TEXT,   -- vault reference string, never the raw secret
  p_sandbox     BOOLEAN DEFAULT TRUE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Guard: reject if caller tries to pass a plaintext secret (heuristic check)
  IF p_secret_ref NOT LIKE 'vault:%' THEN
    RAISE EXCEPTION 'secret_key_ref must be a vault reference (e.g. vault:secret/tenants/.../rapyd#secret_key), not a plaintext value';
  END IF;

  UPDATE tenant_configs
  SET
    rapyd_config = jsonb_build_object(
      'access_key',     p_access_key,
      'secret_key_ref', p_secret_ref,
      'sandbox',        p_sandbox
    ),
    payment_provider          = 'rapyd',
    payment_provider_sandbox  = p_sandbox,
    updated_at                = NOW()
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found: %', p_tenant_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION get_tenant_rapyd_credentials(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config JSONB;
BEGIN
  SELECT rapyd_config INTO v_config
  FROM tenant_configs
  WHERE id = p_tenant_id AND is_active = TRUE;

  IF v_config IS NULL THEN
    RAISE EXCEPTION 'No Rapyd config found for tenant %', p_tenant_id;
  END IF;

  RETURN v_config;
END;
$$;

CREATE OR REPLACE FUNCTION save_tenant_yesh_credentials(
  p_tenant_id    UUID,
  p_api_key_ref  TEXT,   -- vault reference, never plaintext
  p_company_id   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_api_key_ref NOT LIKE 'vault:%' THEN
    RAISE EXCEPTION 'api_key_ref must be a vault reference (e.g. vault:secret/tenants/.../yesh#api_key), not a plaintext value';
  END IF;

  UPDATE tenant_configs
  SET
    yesh_config = jsonb_build_object(
      'api_key_ref', p_api_key_ref,
      'company_id',  p_company_id
    ),
    invoicing_provider = 'yesh',
    updated_at         = NOW()
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found: %', p_tenant_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION get_tenant_yesh_credentials(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config JSONB;
BEGIN
  SELECT yesh_config INTO v_config
  FROM tenant_configs
  WHERE id = p_tenant_id AND is_active = TRUE;

  IF v_config IS NULL THEN
    RAISE EXCEPTION 'No Yesh config found for tenant %', p_tenant_id;
  END IF;

  RETURN v_config;
END;
$$;

-- RPC: store Rapyd customer_id after first successful checkout
CREATE OR REPLACE FUNCTION set_tenant_rapyd_customer_id(
  p_tenant_id   UUID,
  p_customer_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE tenant_configs
  SET
    rapyd_config = rapyd_config || jsonb_build_object('customer_id', p_customer_id),
    updated_at   = NOW()
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found: %', p_tenant_id;
  END IF;
END;
$$;
