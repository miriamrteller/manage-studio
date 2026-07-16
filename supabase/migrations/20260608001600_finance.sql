-- =============================================================================
-- 001600: Finance — Payments + Provider RPCs + Billing/Invoicing tables
-- payments lives here because payments.engagement_id FKs engagements (001300).
-- Includes Grow document persistence (retention, access log, legal-documents bucket).
-- DEPENDENCIES: 000200, 000300, 000500, 001300, 001100
-- =============================================================================

CREATE TABLE payments (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID        NOT NULL REFERENCES tenants(id),
  account_id               UUID        REFERENCES accounts(id),
  person_id                UUID        REFERENCES people(id),
  offering_id              UUID        REFERENCES offerings(id),
  engagement_id            UUID        REFERENCES engagements(id),
  billing_account_id       UUID        REFERENCES billing_accounts(id),
  charge_type              TEXT        NOT NULL DEFAULT 'initial'
                           CHECK (charge_type IN ('initial', 'renewal', 'setup', 'adjustment', 'refund')),
  provider                 TEXT        NOT NULL DEFAULT 'stripe',
  provider_payment_ref     TEXT        UNIQUE,
  payment_method           TEXT        CHECK (payment_method IN ('card','cash','bank_transfer','other')),
  pretax_amount_minor      INT         NOT NULL,
  vat_rate                 NUMERIC(5,4) NOT NULL DEFAULT 0,
  vat_amount_minor         INT         NOT NULL DEFAULT 0,
  total_amount_minor       INT         NOT NULL,
  currency                 TEXT        NOT NULL DEFAULT 'ILS',
  external_document_id     TEXT,
  external_document_number TEXT,
  invoice_issued_at        TIMESTAMPTZ,
  invoice_url              TEXT,
  document_stored_at       TIMESTAMPTZ,
  document_pdf_path        TEXT,
  document_type            TEXT
                           CHECK (document_type IN (
                             'standard_invoice',
                             'credit_note',
                             'osek_patur_receipt',
                             'cross_border',
                             'disputed'
                           )),
  retention_expires_at     TIMESTAMPTZ,
  legal_hold               BOOLEAN     NOT NULL DEFAULT false,
  status                   TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'disputed')),
  description              TEXT,
  paid_at                  TIMESTAMPTZ,
  refunded_at              TIMESTAMPTZ,
  refund_amount_minor      INT,
  refunds_payment_id       UUID        REFERENCES payments(id),
  created_by               UUID        REFERENCES user_profiles(id),
  approved_by              UUID        REFERENCES user_profiles(id),
  anonymised_at            TIMESTAMPTZ,
  -- Yesh / Tranzila document + provider refs (no parallel invoices/bookings tables)
  b2b_flag                 BOOLEAN     NOT NULL DEFAULT false,
  allocation_number        TEXT,
  allocation_status        TEXT,
  allocation_skip_reason   TEXT,
  tranzila_reference_txn_id TEXT,
  tranzila_auth_number     TEXT,
  tranzila_pr_id           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_payer CHECK ((account_id IS NOT NULL) OR (person_id IS NOT NULL)),
  CONSTRAINT payment_refund_amount_sign CHECK (
    charge_type <> 'refund' OR total_amount_minor <= 0
  )
);

CREATE INDEX idx_payments_tenant          ON payments(tenant_id);
CREATE INDEX idx_payments_engagement      ON payments(engagement_id);
CREATE INDEX idx_payments_offering        ON payments(offering_id);
CREATE INDEX idx_payments_billing_account ON payments(billing_account_id);
CREATE INDEX idx_payments_external_document_id
  ON payments (external_document_id)
  WHERE external_document_id IS NOT NULL;

COMMENT ON COLUMN payments.pretax_amount_minor IS 'Legacy — store 0 for new payments. Gross total is total_amount_minor.';
COMMENT ON COLUMN payments.vat_amount_minor IS 'Legacy — store 0 for new payments.';
COMMENT ON COLUMN payments.vat_rate IS 'Legacy — store 0 for new payments.';
COMMENT ON COLUMN payments.document_stored_at IS 'Timestamp when Grow invoice document was first received and stored locally.';
COMMENT ON COLUMN payments.document_pdf_path IS 'Opaque Supabase Storage key for immutable legal PDF copy in the legal-documents bucket.';
COMMENT ON COLUMN payments.document_type IS 'Determines retention period: standard_invoice/credit_note/osek_patur_receipt = 7 yr; cross_border/disputed = 10 yr.';
COMMENT ON COLUMN payments.retention_expires_at IS 'Auto-set on document insert by trigger. Automated deletion job never runs before this date.';
COMMENT ON COLUMN payments.legal_hold IS 'When true, automated deletion is blocked regardless of retention_expires_at.';

-- Payment provider credential RPCs (service_role read; tenant_admin write)
CREATE OR REPLACE FUNCTION get_tenant_payment_credentials(p_tenant_id UUID)
RETURNS TABLE (
  payment_provider_public_key TEXT,
  payment_provider_secret_key TEXT,
  payment_provider_webhook_secret TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE enc_key TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_tenant_payment_credentials: service_role only';
  END IF;
  enc_key := get_app_encryption_key();
  RETURN QUERY SELECT
    t.payment_provider_public_key,
    CASE WHEN t.payment_provider_secret_enc  IS NOT NULL THEN pgp_sym_decrypt(t.payment_provider_secret_enc,  enc_key) ELSE NULL END,
    CASE WHEN t.payment_provider_webhook_enc IS NOT NULL THEN pgp_sym_decrypt(t.payment_provider_webhook_enc, enc_key) ELSE NULL END
  FROM tenants t WHERE t.id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_tenant_payment_credentials(
  p_public_key     TEXT,
  p_secret_key     TEXT,
  p_webhook_secret TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  enc_key     TEXT;
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND tenant_id = v_tenant_id AND 'tenant_admin' = ANY(role)) THEN
    RAISE EXCEPTION 'tenant_admin role required';
  END IF;
  enc_key := get_app_encryption_key();
  UPDATE tenants SET
    payment_provider_public_key   = NULLIF(trim(p_public_key), ''),
    payment_provider_secret_enc   = CASE WHEN p_secret_key     IS NOT NULL AND trim(p_secret_key)     <> '' THEN pgp_sym_encrypt(trim(p_secret_key),     enc_key) ELSE payment_provider_secret_enc   END,
    payment_provider_webhook_enc  = CASE WHEN p_webhook_secret IS NOT NULL AND trim(p_webhook_secret) <> '' THEN pgp_sym_encrypt(trim(p_webhook_secret), enc_key) ELSE payment_provider_webhook_enc  END,
    payment_provider_updated_at   = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

-- Invoicing provider credential RPCs
CREATE OR REPLACE FUNCTION get_tenant_invoicing_credentials(p_tenant_id UUID)
RETURNS TABLE (
  invoicing_account_id TEXT,
  invoicing_api_key    TEXT,
  invoicing_secret     TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE enc_key TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_tenant_invoicing_credentials: service_role only';
  END IF;
  enc_key := get_app_encryption_key();
  RETURN QUERY SELECT
    t.invoicing_account_id,
    CASE WHEN t.invoicing_api_key_enc IS NOT NULL THEN pgp_sym_decrypt(t.invoicing_api_key_enc, enc_key) ELSE NULL END,
    CASE WHEN t.invoicing_secret_enc     IS NOT NULL THEN pgp_sym_decrypt(t.invoicing_secret_enc,     enc_key) ELSE NULL END
  FROM tenants t WHERE t.id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_tenant_invoicing_credentials(
  p_account_id TEXT,
  p_api_key    TEXT,
  p_secret     TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  enc_key     TEXT;
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND tenant_id = v_tenant_id AND 'tenant_admin' = ANY(role)) THEN
    RAISE EXCEPTION 'tenant_admin role required';
  END IF;
  enc_key := get_app_encryption_key();
  UPDATE tenants SET
    invoicing_account_id           = NULLIF(trim(p_account_id), ''),
    invoicing_api_key_enc          = CASE WHEN p_api_key IS NOT NULL AND trim(p_api_key) <> '' THEN pgp_sym_encrypt(trim(p_api_key), enc_key) ELSE invoicing_api_key_enc END,
    invoicing_secret_enc           = CASE WHEN p_secret    IS NOT NULL AND trim(p_secret)    <> '' THEN pgp_sym_encrypt(trim(p_secret),    enc_key) ELSE invoicing_secret_enc     END,
    invoicing_credentials_updated_at = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_tenant_grow_credentials(
  p_user_id   TEXT,
  p_page_code TEXT,
  p_api_key   TEXT
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

  UPDATE payment_method_tokens SET
    revoked_at = now(),
    is_default = false,
    updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND provider <> 'grow'
    AND revoked_at IS NULL;

  UPDATE tenants SET
    payment_provider             = 'grow',
    invoicing_provider           = 'grow',
    payment_provider_account_id  = NULLIF(trim(p_user_id), ''),
    payment_provider_public_key  = NULLIF(trim(p_page_code), ''),
    payment_provider_secret_enc  = CASE
      WHEN p_api_key IS NOT NULL AND trim(p_api_key) <> ''
      THEN pgp_sym_encrypt(trim(p_api_key), enc_key)
      ELSE payment_provider_secret_enc
    END,
    payment_provider_updated_at  = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

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

  UPDATE payment_method_tokens SET
    revoked_at = now(),
    is_default = false,
    updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND provider <> 'icount'
    AND revoked_at IS NULL;

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

-- ── Rapyd / Yesh / Tranzila credential RPCs (pgp_sym_encrypt; mirror Grow auth) ──

CREATE OR REPLACE FUNCTION save_tenant_rapyd_credentials(
  p_access_key TEXT,
  p_secret_key TEXT,
  p_sandbox    BOOLEAN DEFAULT TRUE
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
  IF p_access_key IS NULL OR trim(p_access_key) = '' THEN
    RAISE EXCEPTION 'p_access_key is required';
  END IF;
  enc_key := get_app_encryption_key();

  UPDATE payment_method_tokens SET
    revoked_at = now(), is_default = false, updated_at = now()
  WHERE tenant_id = v_tenant_id AND provider <> 'rapyd' AND revoked_at IS NULL;

  UPDATE tenants SET
    payment_provider            = 'rapyd',
    payment_provider_sandbox    = COALESCE(p_sandbox, true),
    payment_provider_public_key = NULLIF(trim(p_access_key), ''),
    rapyd_config = jsonb_strip_nulls(jsonb_build_object(
      'access_key', trim(p_access_key),
      'sandbox', COALESCE(p_sandbox, true),
      'customer_id', rapyd_config->>'customer_id'
    )),
    payment_provider_secret_enc = CASE
      WHEN p_secret_key IS NOT NULL AND trim(p_secret_key) <> ''
      THEN pgp_sym_encrypt(trim(p_secret_key), enc_key)
      ELSE payment_provider_secret_enc
    END,
    payment_provider_updated_at = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_tenant_rapyd_credentials(p_tenant_id UUID)
RETURNS TABLE (
  access_key  TEXT,
  secret_key  TEXT,
  sandbox     BOOLEAN,
  customer_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE enc_key TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_tenant_rapyd_credentials: service_role only';
  END IF;
  enc_key := get_app_encryption_key();
  RETURN QUERY SELECT
    COALESCE(t.rapyd_config->>'access_key', t.payment_provider_public_key),
    CASE WHEN t.payment_provider_secret_enc IS NOT NULL
      THEN pgp_sym_decrypt(t.payment_provider_secret_enc, enc_key) ELSE NULL END,
    COALESCE((t.rapyd_config->>'sandbox')::boolean, t.payment_provider_sandbox),
    t.rapyd_config->>'customer_id'
  FROM tenants t
  WHERE t.id = p_tenant_id AND t.payment_provider = 'rapyd';
END;
$$;

CREATE OR REPLACE FUNCTION set_tenant_rapyd_customer_id(
  p_tenant_id   UUID,
  p_customer_id TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'set_tenant_rapyd_customer_id: service_role only';
  END IF;
  UPDATE tenants SET
    rapyd_config = COALESCE(rapyd_config, '{}'::jsonb)
      || jsonb_build_object('customer_id', p_customer_id),
    updated_at = now()
  WHERE id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_tenant_yesh_credentials(
  p_company_id TEXT,
  p_api_key    TEXT
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
  IF p_company_id IS NULL OR trim(p_company_id) = '' THEN
    RAISE EXCEPTION 'p_company_id is required';
  END IF;
  enc_key := get_app_encryption_key();

  UPDATE tenants SET
    invoicing_provider   = 'yesh',
    invoicing_account_id = NULLIF(trim(p_company_id), ''),
    yesh_config = jsonb_build_object('company_id', trim(p_company_id)),
    invoicing_api_key_enc = CASE
      WHEN p_api_key IS NOT NULL AND trim(p_api_key) <> ''
      THEN pgp_sym_encrypt(trim(p_api_key), enc_key)
      ELSE invoicing_api_key_enc
    END,
    invoicing_credentials_updated_at = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_tenant_yesh_credentials(p_tenant_id UUID)
RETURNS TABLE (
  company_id TEXT,
  api_key    TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE enc_key TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_tenant_yesh_credentials: service_role only';
  END IF;
  enc_key := get_app_encryption_key();
  RETURN QUERY SELECT
    COALESCE(t.yesh_config->>'company_id', t.invoicing_account_id),
    CASE WHEN t.invoicing_api_key_enc IS NOT NULL
      THEN pgp_sym_decrypt(t.invoicing_api_key_enc, enc_key) ELSE NULL END
  FROM tenants t
  WHERE t.id = p_tenant_id AND t.invoicing_provider = 'yesh';
END;
$$;

CREATE OR REPLACE FUNCTION save_tenant_tranzila_credentials(
  p_terminal_name TEXT,
  p_app_key       TEXT,
  p_secret_key    TEXT
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
  IF p_terminal_name IS NULL OR trim(p_terminal_name) = '' THEN
    RAISE EXCEPTION 'p_terminal_name is required';
  END IF;
  IF trim(p_terminal_name) !~ '^[a-z][a-z0-9]{2,15}$' THEN
    RAISE EXCEPTION 'Invalid tranzila_terminal_name format';
  END IF;
  enc_key := get_app_encryption_key();

  UPDATE payment_method_tokens SET
    revoked_at = now(), is_default = false, updated_at = now()
  WHERE tenant_id = v_tenant_id AND provider <> 'tranzila' AND revoked_at IS NULL;

  UPDATE tenants SET
    payment_provider       = 'tranzila',
    invoicing_provider     = 'tranzila',
    tranzila_terminal_name = trim(p_terminal_name),
    payment_provider_public_key = NULLIF(trim(p_app_key), ''),
    payment_provider_secret_enc = CASE
      WHEN p_secret_key IS NOT NULL AND trim(p_secret_key) <> ''
      THEN pgp_sym_encrypt(trim(p_secret_key), enc_key)
      ELSE payment_provider_secret_enc
    END,
    payment_provider_updated_at = now(),
    updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_tenant_tranzila_credentials(p_tenant_id UUID)
RETURNS TABLE (
  terminal_name TEXT,
  app_key       TEXT,
  secret_key    TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE enc_key TEXT;
BEGIN
  IF NOT is_service_role() THEN
    RAISE EXCEPTION 'get_tenant_tranzila_credentials: service_role only';
  END IF;
  enc_key := get_app_encryption_key();
  RETURN QUERY SELECT
    t.tranzila_terminal_name,
    t.payment_provider_public_key,
    CASE WHEN t.payment_provider_secret_enc IS NOT NULL
      THEN pgp_sym_decrypt(t.payment_provider_secret_enc, enc_key) ELSE NULL END
  FROM tenants t
  WHERE t.id = p_tenant_id AND t.payment_provider = 'tranzila';
END;
$$;

-- Safe card display RPC (Stage 8 UI; auth enforced here)
CREATE OR REPLACE FUNCTION get_billing_account_payment_method(p_billing_account_id UUID)
RETURNS TABLE (card_brand TEXT, last4 TEXT, exp_month INT, exp_year INT, is_default BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id  UUID;
  v_account_id UUID;
  v_person_id  UUID;
BEGIN
  SELECT ba.tenant_id, ba.account_id, ba.person_id
    INTO v_tenant_id, v_account_id, v_person_id
  FROM billing_accounts ba
  WHERE ba.id = p_billing_account_id;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND tenant_id = v_tenant_id
        AND 'tenant_admin' = ANY(role)
    )
    OR (
      v_tenant_id = get_my_tenant_id()
      AND (
        (v_account_id IS NOT NULL AND v_account_id IN (SELECT get_my_account_ids()))
        OR (v_person_id IS NOT NULL AND v_person_id = get_my_person_id())
      )
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT pmt.card_brand, pmt.last4, pmt.exp_month, pmt.exp_year, pmt.is_default
  FROM payment_method_tokens pmt
  WHERE pmt.billing_account_id = p_billing_account_id
    AND pmt.revoked_at IS NULL
    AND pmt.is_default = true
  LIMIT 1;
END;
$$;

CREATE TABLE payment_method_tokens (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id),
  billing_account_id  UUID        NOT NULL REFERENCES billing_accounts(id),
  provider            TEXT        NOT NULL,
  provider_token      TEXT        NOT NULL,
  card_brand          TEXT,
  last4               TEXT,
  exp_month           INT         CHECK (exp_month BETWEEN 1 AND 12),
  exp_year            INT,
  is_default          BOOLEAN     NOT NULL DEFAULT false,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pmt_tenant  ON payment_method_tokens(tenant_id);
CREATE INDEX idx_pmt_account ON payment_method_tokens(billing_account_id);
CREATE UNIQUE INDEX idx_pmt_one_default ON payment_method_tokens(billing_account_id)
  WHERE is_default AND revoked_at IS NULL;

CREATE TABLE billing_schedules (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID        NOT NULL REFERENCES tenants(id),
  engagement_id            UUID        NOT NULL UNIQUE REFERENCES engagements(id),
  billing_account_id       UUID        REFERENCES billing_accounts(id),
  payment_method_token_id  UUID        REFERENCES payment_method_tokens(id) ON DELETE SET NULL,
  next_billing_date        DATE        NOT NULL,
  next_attempt_at          TIMESTAMPTZ,
  last_attempt_at          TIMESTAMPTZ,
  last_error               TEXT,
  attempt_count            INT         NOT NULL DEFAULT 0,
  status                   TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','paused','suspended','cancelled')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_billing_schedules_tenant ON billing_schedules(tenant_id);
CREATE INDEX idx_billing_schedules_due ON billing_schedules(status, next_billing_date, next_attempt_at)
  WHERE status = 'active';

CREATE TABLE invoicing_token_cache (
  tenant_id   UUID        PRIMARY KEY REFERENCES tenants(id),
  token       TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE document_queue (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  payment_id            UUID        NOT NULL REFERENCES payments(id),
  document_kind         TEXT        NOT NULL CHECK (document_kind IN ('sale','refund')),
  attempts              INT         NOT NULL DEFAULT 0,
  last_error            TEXT,
  scheduled_for         TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_started_at TIMESTAMPTZ,
  succeeded_at          TIMESTAMPTZ,
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','succeeded','dead')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_queue_due ON document_queue(scheduled_for)
  WHERE status = 'pending';
CREATE UNIQUE INDEX idx_document_queue_one_active ON document_queue(payment_id, document_kind)
  WHERE status IN ('pending', 'processing');

GRANT EXECUTE ON FUNCTION get_tenant_payment_credentials(UUID)              TO service_role;
GRANT EXECUTE ON FUNCTION save_tenant_payment_credentials(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_invoicing_credentials(UUID)            TO service_role;
GRANT EXECUTE ON FUNCTION save_tenant_invoicing_credentials(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION save_tenant_grow_credentials(TEXT, TEXT, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION save_tenant_icount_credentials(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION save_tenant_rapyd_credentials(TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION save_tenant_yesh_credentials(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION save_tenant_tranzila_credentials(TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION get_tenant_rapyd_credentials(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_tenant_yesh_credentials(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION get_tenant_tranzila_credentials(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION set_tenant_rapyd_customer_id(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_rapyd_credentials(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_tenant_yesh_credentials(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_tenant_tranzila_credentials(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION set_tenant_rapyd_customer_id(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_billing_account_payment_method(UUID)          TO authenticated;

ALTER TABLE payments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_method_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_schedules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoicing_token_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_queue         ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_super_admin    ON payments FOR ALL    USING (is_super_admin());
CREATE POLICY payments_admin_all      ON payments FOR ALL    USING (tenant_id = get_my_tenant_id() AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));
CREATE POLICY payments_account_select ON payments FOR SELECT USING (tenant_id = get_my_tenant_id() AND (person_id = get_my_person_id() OR account_id IN (SELECT get_my_account_ids())));

CREATE POLICY pmt_super_admin ON payment_method_tokens FOR ALL USING (is_super_admin());
CREATE POLICY pmt_admin_all ON payment_method_tokens FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

CREATE POLICY billing_schedules_super_admin ON billing_schedules FOR ALL USING (is_super_admin());
CREATE POLICY billing_schedules_admin ON billing_schedules FOR ALL
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

REVOKE ALL ON invoicing_token_cache FROM anon;
REVOKE ALL ON invoicing_token_cache FROM authenticated;
CREATE POLICY invoicing_token_cache_super_admin ON invoicing_token_cache FOR ALL
  USING (is_super_admin());

CREATE POLICY document_queue_super_admin ON document_queue FOR ALL USING (is_super_admin());
CREATE POLICY document_queue_admin_select ON document_queue FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)));

-- Grow document retention trigger
CREATE OR REPLACE FUNCTION payments_set_retention_expires_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.document_stored_at IS NOT NULL AND OLD.document_stored_at IS NULL THEN
    NEW.retention_expires_at := CASE NEW.document_type
      WHEN 'cross_border' THEN NEW.document_stored_at + interval '10 years'
      WHEN 'disputed'     THEN NEW.document_stored_at + interval '10 years'
      ELSE                     NEW.document_stored_at + interval '7 years'
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payments_retention_expires_at_trigger
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION payments_set_retention_expires_at();

-- Audit log: who accessed or resent each invoice document
CREATE TABLE payment_document_access_log (
  id           bigserial    PRIMARY KEY,
  payment_id   uuid         NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  accessed_by  uuid         REFERENCES auth.users(id),
  action       text         NOT NULL DEFAULT 'view'
                            CHECK (action IN ('view', 'download', 'resend', 'legal_hold_set', 'legal_hold_released')),
  accessed_at  timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE payment_document_access_log IS
  '7-year legal retention: complete audit trail of who accessed, downloaded, or resent each invoice document.';

CREATE INDEX idx_doc_access_log_payment
  ON payment_document_access_log (payment_id);
CREATE INDEX idx_doc_access_log_user
  ON payment_document_access_log (accessed_by)
  WHERE accessed_by IS NOT NULL;

ALTER TABLE payment_document_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY pdal_super_admin ON payment_document_access_log
  FOR ALL USING (is_super_admin());

CREATE POLICY pdal_tenant_admin_select ON payment_document_access_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id = payment_document_access_log.payment_id
        AND p.tenant_id = get_my_tenant_id()
    )
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND tenant_id = get_my_tenant_id()
        AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY pdal_service_role_insert ON payment_document_access_log
  FOR INSERT
  WITH CHECK (is_service_role());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'legal-documents',
  'legal-documents',
  false,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "legal_documents_service_role_all" ON storage.objects;
DROP POLICY IF EXISTS "legal_documents_admin_select" ON storage.objects;

CREATE POLICY "legal_documents_service_role_all"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'legal-documents');

CREATE POLICY "legal_documents_admin_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'legal-documents'
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND 'tenant_admin' = ANY(role)
    )
  );


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

GRANT EXECUTE ON FUNCTION save_icount_webhook_secret(TEXT) TO authenticated;


-- =============================================================================
-- Finance admin: aggregated summary RPC (revenue, expenses, outstanding)
-- DEPENDENCIES: 000200, 000500, 001300, 001600, 20260625000100 (expenses)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_finance_summary(
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  net_revenue_minor        BIGINT,
  payment_count            BIGINT,
  outstanding_engagements  BIGINT,
  failed_payments_7d       BIGINT,
  net_expenses_minor       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_season_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  SELECT id INTO v_season_id
  FROM seasons
  WHERE tenant_id = v_tenant_id AND status = 'active'
  LIMIT 1;

  RETURN QUERY
  SELECT
    COALESCE((
      SELECT SUM(total_amount_minor)
      FROM payments
      WHERE tenant_id = v_tenant_id
        AND status IN ('succeeded', 'partially_refunded')
        AND paid_at IS NOT NULL
        AND paid_at::date BETWEEN p_start_date AND p_end_date
    ), 0)::bigint,
    COALESCE((
      SELECT COUNT(*)::bigint
      FROM payments
      WHERE tenant_id = v_tenant_id
        AND status = 'succeeded'
        AND charge_type IN ('initial', 'renewal')
        AND paid_at IS NOT NULL
        AND paid_at::date BETWEEN p_start_date AND p_end_date
    ), 0)::bigint,
    COALESCE((
      SELECT COUNT(*)::bigint
      FROM engagements
      WHERE tenant_id = v_tenant_id
        AND status = 'pending_payment'
        AND season_id IS NOT DISTINCT FROM v_season_id
    ), 0)::bigint,
    COALESCE((
      SELECT COUNT(*)::bigint
      FROM payments
      WHERE tenant_id = v_tenant_id
        AND status = 'failed'
        AND created_at >= (now() - interval '7 days')
    ), 0)::bigint,
    COALESCE((
      SELECT SUM(total_amount_minor)
      FROM expenses
      WHERE tenant_id = v_tenant_id
        AND expense_date BETWEEN p_start_date AND p_end_date
    ), 0)::bigint;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_finance_summary(DATE, DATE) TO authenticated;


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


-- =============================================================================
-- 000500: Admin document RPCs — retrieve stored document fields + signed URL path
-- GAP 5: Admin-only access to Grow invoice documents with full audit logging.
-- DEPENDENCIES: 20260608001600_finance.sql (payment_document_access_log, payments.document_*)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- RPC: admin_get_payment_document
-- Returns all document fields for a payment. Logs every call to audit table.
-- Caller must be tenant_admin for the tenant that owns the payment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_get_payment_document(p_payment_id uuid)
RETURNS TABLE (
  payment_id               uuid,
  external_document_id     text,
  external_document_number text,
  invoice_url              text,
  document_pdf_path        text,
  document_stored_at       timestamptz,
  document_type            text,
  retention_expires_at     timestamptz,
  legal_hold               boolean,
  tenant_id                uuid
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Verify caller is a tenant_admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'admin_get_payment_document: tenant_admin role required';
  END IF;

  -- Verify payment belongs to caller's tenant
  SELECT p.tenant_id INTO v_tenant_id
  FROM payments p
  WHERE p.id = p_payment_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'admin_get_payment_document: payment not found';
  END IF;

  IF v_tenant_id <> get_my_tenant_id() THEN
    RAISE EXCEPTION 'admin_get_payment_document: cross-tenant access denied';
  END IF;

  -- Audit log
  INSERT INTO payment_document_access_log (payment_id, accessed_by, action)
  VALUES (p_payment_id, auth.uid(), 'view');

  RETURN QUERY
  SELECT
    p.id,
    p.external_document_id,
    p.external_document_number,
    p.invoice_url,
    p.document_pdf_path,
    p.document_stored_at,
    p.document_type,
    p.retention_expires_at,
    p.legal_hold,
    p.tenant_id
  FROM payments p
  WHERE p.id = p_payment_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: admin_get_document_signed_url_path
-- Returns the storage path for the stored PDF so the client can generate a
-- short-lived signed URL via supabase.storage.from('legal-documents').createSignedUrl(path, 300).
-- (Supabase does not support Storage signed-URL generation inside PL/pgSQL.)
-- Logs a 'download' event to the audit table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_get_document_signed_url_path(p_payment_id uuid)
RETURNS text
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_pdf_path  text;
  v_tenant_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND 'tenant_admin' = ANY(role)
  ) THEN
    RAISE EXCEPTION 'admin_get_document_signed_url_path: tenant_admin role required';
  END IF;

  SELECT p.document_pdf_path, p.tenant_id
    INTO v_pdf_path, v_tenant_id
  FROM payments p
  WHERE p.id = p_payment_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'admin_get_document_signed_url_path: payment not found';
  END IF;

  IF v_tenant_id <> get_my_tenant_id() THEN
    RAISE EXCEPTION 'admin_get_document_signed_url_path: cross-tenant access denied';
  END IF;

  IF v_pdf_path IS NULL THEN
    RAISE EXCEPTION 'admin_get_document_signed_url_path: no stored PDF for payment %', p_payment_id;
  END IF;

  -- Audit log
  INSERT INTO payment_document_access_log (payment_id, accessed_by, action)
  VALUES (p_payment_id, auth.uid(), 'download');

  -- Client calls: supabase.storage.from('legal-documents').createSignedUrl(path, 300)
  RETURN v_pdf_path;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin_get_payment_document(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_document_signed_url_path(uuid)   TO authenticated;

-- =============================================================================
-- Finance admin: expenses (immutable) + create_expense RPC
-- Gross-only amounts: pretax_amount_minor = total_amount_minor, vat_amount_minor = 0.
-- =============================================================================

CREATE TABLE expenses (
  id                    UUID PRIMARY KEY,
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  category_id           UUID NOT NULL REFERENCES expense_categories(id),
  description           TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  pretax_amount_minor   INT NOT NULL,
  vat_amount_minor      INT NOT NULL DEFAULT 0 CHECK (vat_amount_minor >= 0),
  total_amount_minor    INT NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'ILS',
  supplier_name         TEXT CHECK (supplier_name IS NULL OR char_length(supplier_name) <= 200),
  supplier_vat_number   TEXT CHECK (supplier_vat_number IS NULL OR char_length(supplier_vat_number) <= 20),
  receipt_storage_path  TEXT,
  expense_date          DATE NOT NULL,
  corrects_expense_id   UUID REFERENCES expenses(id),
  created_by            UUID NOT NULL REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expenses_total_check CHECK (total_amount_minor = pretax_amount_minor + vat_amount_minor),
  CONSTRAINT expenses_correction_sign CHECK (
    corrects_expense_id IS NULL OR (
      total_amount_minor <= 0 AND pretax_amount_minor <= 0 AND vat_amount_minor <= 0
    )
  )
);

CREATE INDEX idx_expenses_tenant_date ON expenses(tenant_id, expense_date DESC);
CREATE INDEX idx_expenses_tenant_category ON expenses(tenant_id, category_id);

COMMENT ON TABLE expenses IS
  'Immutable expense rows. Amounts are gross-only: pretax_amount_minor = total_amount_minor, vat_amount_minor = 0.';

CREATE OR REPLACE FUNCTION public.reject_expense_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'expenses are immutable';
END;
$$;

CREATE TRIGGER expenses_no_update
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.reject_expense_mutation();

CREATE TRIGGER expenses_no_delete
  BEFORE DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.reject_expense_mutation();

CREATE OR REPLACE FUNCTION public.validate_expense_category_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM expense_categories c
    WHERE c.id = NEW.category_id
      AND c.tenant_id = NEW.tenant_id
      AND c.is_active = true
  ) THEN
    RAISE EXCEPTION 'invalid or inactive expense category for tenant';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_validate_category
  BEFORE INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.validate_expense_category_tenant();

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY expenses_super_admin ON expenses
  FOR ALL USING (is_super_admin());

CREATE POLICY expenses_admin_select ON expenses
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)
    )
  );

GRANT SELECT ON public.expenses TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.expenses FROM authenticated;

CREATE OR REPLACE FUNCTION public.create_expense(
  p_expense_id            UUID,
  p_category_id           UUID,
  p_description           TEXT,
  p_pretax_amount_minor   INT,
  p_vat_amount_minor      INT,
  p_total_amount_minor    INT,
  p_currency              TEXT,
  p_supplier_name         TEXT,
  p_supplier_vat_number   TEXT,
  p_receipt_storage_path  TEXT,
  p_expense_date          DATE,
  p_corrects_expense_id   UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id       UUID;
  v_currency        TEXT;
  v_today           DATE;
  v_receipt_pattern TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF EXISTS (SELECT 1 FROM expenses WHERE id = p_expense_id) THEN
    RAISE EXCEPTION 'expense id already exists';
  END IF;

  IF char_length(trim(p_description)) < 1 OR char_length(p_description) > 500 THEN
    RAISE EXCEPTION 'description must be 1-500 characters';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM expense_categories
    WHERE id = p_category_id AND tenant_id = v_tenant_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'invalid or inactive expense category';
  END IF;

  SELECT t.currency INTO v_currency
  FROM tenants t
  WHERE t.id = v_tenant_id;

  IF p_currency IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION 'currency must match tenant currency';
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  IF p_expense_date > v_today THEN
    RAISE EXCEPTION 'expense_date cannot be in the future';
  END IF;

  IF p_corrects_expense_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM expenses
      WHERE id = p_corrects_expense_id AND tenant_id = v_tenant_id
    ) THEN
      RAISE EXCEPTION 'corrects_expense_id not found for tenant';
    END IF;
    IF p_description NOT LIKE '[Correction]%' THEN
      RAISE EXCEPTION 'correction description must start with [Correction]';
    END IF;
    IF p_pretax_amount_minor > 0 OR p_vat_amount_minor > 0 OR p_total_amount_minor > 0 THEN
      RAISE EXCEPTION 'correction amounts must be zero or negative';
    END IF;
  ELSE
    IF p_total_amount_minor <= 0 THEN
      RAISE EXCEPTION 'expense amount must be positive';
    END IF;
  END IF;

  IF p_vat_amount_minor <> 0 THEN
    RAISE EXCEPTION 'vat_amount_minor must be zero';
  END IF;

  IF p_pretax_amount_minor <> p_total_amount_minor THEN
    RAISE EXCEPTION 'pretax_amount_minor must equal total_amount_minor';
  END IF;

  IF p_receipt_storage_path IS NOT NULL THEN
    v_receipt_pattern := v_tenant_id::text || '/' || p_expense_id::text || '/receipt.';
    IF left(p_receipt_storage_path, length(v_receipt_pattern)) <> v_receipt_pattern THEN
      RAISE EXCEPTION 'invalid receipt_storage_path';
    END IF;
  END IF;

  INSERT INTO expenses (
    id, tenant_id, category_id, description,
    pretax_amount_minor, vat_amount_minor, total_amount_minor, currency,
    supplier_name, supplier_vat_number, receipt_storage_path,
    expense_date, corrects_expense_id, created_by
  ) VALUES (
    p_expense_id, v_tenant_id, p_category_id, trim(p_description),
    p_pretax_amount_minor, p_vat_amount_minor, p_total_amount_minor, p_currency,
    NULLIF(trim(p_supplier_name), ''), NULLIF(trim(p_supplier_vat_number), ''),
    p_receipt_storage_path, p_expense_date, p_corrects_expense_id, auth.uid()
  );

  INSERT INTO audit_log (
    tenant_id, actor_id, action, entity_type, entity_id
  ) VALUES (
    v_tenant_id, auth.uid(), 'CREATE', 'expenses', p_expense_id
  );

  RETURN p_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_expense(
  UUID, UUID, TEXT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, DATE, UUID
) TO authenticated;
