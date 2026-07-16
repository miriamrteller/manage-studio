-- ============================================================================
-- Migration: 20260710000100_tranzila_schema.sql
-- Purpose:   Tranzila payment + invoicing schema
--            - bookings table (deposit-first booking flow)
--            - payment_callbacks_log (webhook idempotency)
--            - tranzila_tokens (PCI SAQ A: opaque TK tokens only — NEVER PAN/CVV/expiry)
--            - tenant_invoices (Tranzila-issued invoices, 7-year ITA retention)
--            - ALTER tenant_credentials (invoicing_enabled, invoice_lang, default_doc_type)
--            - ALTER tenant_settings (tranzila_terminal_name, expiry/nudge config, etc.)
--            - ALTER payments (tranzila reference columns)
-- Rule:      Additive only — no destructive changes to existing tables or columns
-- ============================================================================

-- ── Bookings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_name      TEXT          NOT NULL,
  client_email     TEXT          NOT NULL,
  service_name     TEXT          NOT NULL,
  amount           NUMERIC(10,2) NOT NULL,
  currency_code    TEXT          NOT NULL DEFAULT 'ILS',
  state            TEXT          NOT NULL DEFAULT 'RESERVED'
                   CHECK (state IN ('RESERVED', 'CONFIRMED', 'RELEASED', 'REFUNDED')),
  pr_id            TEXT          UNIQUE,
  pr_link          TEXT,
  pr_expires_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW() + INTERVAL '20 minutes',
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   DEFAULT NOW(),
  booking_language TEXT          DEFAULT 'hebrew',
  payment_methods  INTEGER[]     DEFAULT '{1}'
);

CREATE INDEX IF NOT EXISTS idx_bookings_tenant_id     ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_pr_id         ON bookings(pr_id);
CREATE INDEX IF NOT EXISTS idx_bookings_state_expires ON bookings(state, pr_expires_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_bookings_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_set_updated_at ON bookings;
CREATE TRIGGER bookings_set_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION trg_bookings_set_updated_at();

-- ── Payment Callbacks Log ───────────────────────────────────────────────────
-- Idempotency log for inbound Tranzila NOTIFY callbacks
CREATE TABLE IF NOT EXISTS payment_callbacks_log (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id         TEXT    NOT NULL,
  raw_payload   JSONB   NOT NULL,
  processed     BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_callbacks_pr_id ON payment_callbacks_log(pr_id);

-- ── Tranzila TK Tokens ──────────────────────────────────────────────────────
-- PCI SAQ A: opaque TK token IDs only — NEVER store PAN, CVV, or expiry date
CREATE TABLE IF NOT EXISTS tranzila_tokens (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id            UUID NOT NULL,
  -- opaque TK token from Tranzila Hosted Fields — never store PAN/CVV/expiry
  tranzila_tk_token_id TEXT NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  last_used_at         TIMESTAMPTZ,
  revoked_at           TIMESTAMPTZ,
  UNIQUE (tenant_id, tranzila_tk_token_id)
);

CREATE INDEX IF NOT EXISTS idx_tranzila_tokens_tenant_client
  ON tranzila_tokens(tenant_id, client_id);

-- ── Tenant Invoices ─────────────────────────────────────────────────────────
-- 7-year ITA retention: Israeli Tax Authority legal requirement
CREATE TABLE IF NOT EXISTS tenant_invoices (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID          NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  doc_number           TEXT          NOT NULL,
  retrieval_key        TEXT          NOT NULL,
  pdf_storage_path     TEXT          NOT NULL,
  client_name          TEXT,
  client_company       TEXT,
  client_id            TEXT,
  amount               NUMERIC(10,2) NOT NULL,
  currency_code        TEXT          DEFAULT 'ILS',
  issue_date           DATE          NOT NULL,
  doc_type             TEXT          NOT NULL,
  txnindex             INTEGER,
  archived             BOOLEAN       NOT NULL DEFAULT FALSE,
  -- GENERATED ALWAYS: 7-year ITA retention enforced at DB level (Israeli Tax Authority)
  retention_expires_at TIMESTAMPTZ   NOT NULL
    GENERATED ALWAYS AS (created_at + INTERVAL '7 years') STORED,
  created_at           TIMESTAMPTZ   DEFAULT NOW(),
  created_by_user      UUID          NOT NULL
);

CREATE INDEX        IF NOT EXISTS idx_tenant_invoices_tenant_id
  ON tenant_invoices(tenant_id);
CREATE INDEX        IF NOT EXISTS idx_tenant_invoices_doc_number
  ON tenant_invoices(doc_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_invoices_retrieval_key
  ON tenant_invoices(retrieval_key);

-- Early-delete guard: block hard-deletes within the 7-year retention window
CREATE OR REPLACE FUNCTION trg_tenant_invoices_no_early_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.retention_expires_at > NOW() THEN
    RAISE EXCEPTION
      'Invoice % cannot be deleted before retention_expires_at (%)',
      OLD.doc_number, OLD.retention_expires_at;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tenant_invoices_no_early_delete ON tenant_invoices;
CREATE TRIGGER tenant_invoices_no_early_delete
  BEFORE DELETE ON tenant_invoices
  FOR EACH ROW EXECUTE FUNCTION trg_tenant_invoices_no_early_delete();

-- ── ALTER tenant_credentials ────────────────────────────────────────────────
ALTER TABLE tenant_credentials
  ADD COLUMN IF NOT EXISTS invoicing_enabled  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_lang       TEXT    DEFAULT 'heb',
  ADD COLUMN IF NOT EXISTS default_doc_type   TEXT    DEFAULT 'IR';

-- ── ALTER tenant_settings ───────────────────────────────────────────────────
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS tranzila_terminal_name TEXT
    CHECK (tranzila_terminal_name IS NULL OR tranzila_terminal_name ~ '^[a-z][a-z0-9]{2,15}$'),
  ADD COLUMN IF NOT EXISTS payment_expiry_minutes INTEGER   DEFAULT 20,
  ADD COLUMN IF NOT EXISTS payment_nudge_minutes  INTEGER   DEFAULT 5,
  ADD COLUMN IF NOT EXISTS payment_methods        INTEGER[] DEFAULT '{1}',
  ADD COLUMN IF NOT EXISTS booking_language       TEXT      DEFAULT 'hebrew';

-- ── ALTER payments ──────────────────────────────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS tranzila_reference_txn_id TEXT,
  ADD COLUMN IF NOT EXISTS tranzila_auth_number       TEXT,
  ADD COLUMN IF NOT EXISTS tranzila_pr_id             TEXT REFERENCES bookings(pr_id);
