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
