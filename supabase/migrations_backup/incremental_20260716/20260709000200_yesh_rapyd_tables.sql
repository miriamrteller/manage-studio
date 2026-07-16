-- =============================================================================
-- Migration: 20260709000200_yesh_rapyd_tables.sql
-- Purpose:   Create invoices, webhook_events, invoice_retry_queue, and
--            client_payment_tokens tables.
-- HITL-PA-01 resolved (Miriam 2026-07-09): allocation_skip_reason stored for
--            audit trail and dispute resolution (Option B chosen).
-- Rule:      Additive only — no DROP, no column rename.
-- =============================================================================

-- ── 1. invoices table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID          NOT NULL REFERENCES tenant_configs(id) ON DELETE RESTRICT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Provider linkage
  rapyd_payment_id      TEXT          NULL,
  yesh_docnum           TEXT          NULL,

  -- ITA allocation (Tax Delegation Doctrine: Yesh decides, OpalSwift stores)
  allocation_number     TEXT          NULL,
  allocation_status     TEXT          NOT NULL DEFAULT 'not_required'
    CHECK (allocation_status IN ('not_required', 'pending', 'obtained', 'error')),
  -- HITL-PA-01 (Miriam 2026-07-09): always store skip reason for audit + dispute resolution.
  -- Populated from Yesh AllocationResponse.status when allocation_number = null.
  -- Values: 'not_required', 'amount_below_threshold', 'b2c_receipt', 'shaam_unavailable', 'rejected'
  allocation_skip_reason TEXT         NULL,

  -- Invoice fields
  b2b_flag              BOOLEAN       NOT NULL DEFAULT FALSE,
  amount                NUMERIC(12,2) NOT NULL,
  currency              CHAR(3)       NOT NULL,
  status                TEXT          NOT NULL
    CHECK (status IN ('payment_pending', 'payment_confirmed', 'invoice_created', 'fully_invoiced', 'payment_failed', 'refunded')),

  -- Client info
  client_name           TEXT          NOT NULL,
  client_phone          TEXT          NULL,
  line_items            JSONB         NOT NULL DEFAULT '[]'::JSONB,

  -- 7-year ITA retention (Israeli Tax Authority requirement)
  retention_expires_at  TIMESTAMPTZ   NOT NULL
    GENERATED ALWAYS AS (created_at + INTERVAL '7 years') STORED,
  archived              BOOLEAN       NOT NULL DEFAULT FALSE
);

-- Retention trigger: block early deletion
CREATE OR REPLACE FUNCTION enforce_invoice_retention()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.retention_expires_at > NOW() THEN
    RAISE EXCEPTION
      'Invoice % cannot be deleted before retention period expires (%). ITA requires 7-year retention.',
      OLD.id, OLD.retention_expires_at;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_invoice_retention ON invoices;
CREATE TRIGGER trg_enforce_invoice_retention
  BEFORE DELETE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION enforce_invoice_retention();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id
  ON invoices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_rapyd_payment_id
  ON invoices (rapyd_payment_id) WHERE rapyd_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_yesh_docnum
  ON invoices (yesh_docnum) WHERE yesh_docnum IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status
  ON invoices (status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at
  ON invoices (created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_retention_expires_at
  ON invoices (retention_expires_at) WHERE archived = FALSE;

-- ── 2. webhook_events table (Rapyd idempotency log) ─────────────────────────

CREATE TABLE IF NOT EXISTS webhook_events (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   TEXT          UNIQUE NOT NULL,  -- rapyd_payment_id + '_' + event_type
  rapyd_event_type  TEXT          NOT NULL,
  received_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ   NULL,
  outcome           TEXT          NOT NULL
    CHECK (outcome IN (
      'processing', 'processed', 'duplicate',
      'rejected_signature', 'rejected_replay',
      'rejected_cross_tenant', 'dead_lettered'
    )),
  raw_payload       JSONB         NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_webhook_events_updated_at ON webhook_events;
CREATE TRIGGER trg_webhook_events_updated_at
  BEFORE UPDATE ON webhook_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_webhook_events_idempotency_key
  ON webhook_events (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_webhook_events_rapyd_event_type
  ON webhook_events (rapyd_event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
  ON webhook_events (received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_outcome
  ON webhook_events (outcome);

-- ── 3. invoice_retry_queue table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_retry_queue (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID          NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tenant_id       UUID          NOT NULL REFERENCES tenant_configs(id) ON DELETE CASCADE,
  attempt_count   INTEGER       NOT NULL DEFAULT 0,
  next_retry_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  last_error_code TEXT          NULL,
  dead_lettered_at TIMESTAMPTZ  NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_invoice_retry_queue_updated_at ON invoice_retry_queue;
CREATE TRIGGER trg_invoice_retry_queue_updated_at
  BEFORE UPDATE ON invoice_retry_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_retry_queue_next_retry_at
  ON invoice_retry_queue (next_retry_at) WHERE dead_lettered_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_retry_queue_tenant_id
  ON invoice_retry_queue (tenant_id);
CREATE INDEX IF NOT EXISTS idx_retry_queue_invoice_id
  ON invoice_retry_queue (invoice_id);

-- ── 4. client_payment_tokens table (PCI SAQ A — opaque tokens only) ─────────
-- cardNumber, cvv, and expiry are NEVER stored here.
-- Only the opaque tokenId returned by Yesh JS plugin.

CREATE TABLE IF NOT EXISTS client_payment_tokens (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL REFERENCES tenant_configs(id) ON DELETE CASCADE,
  client_id       TEXT          NOT NULL,          -- Yesh clientId
  yesh_token_id   TEXT          NOT NULL,          -- Opaque token; never derivable back to PAN
  tokenised_via   TEXT          NOT NULL DEFAULT 'yesh_js_plugin',  -- 'yesh_js_plugin' | 'yesh_payment_page'
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ   NULL,
  revoked_at      TIMESTAMPTZ   NULL,

  CONSTRAINT uq_client_payment_tokens_tenant_token UNIQUE (tenant_id, yesh_token_id)
);

CREATE INDEX IF NOT EXISTS idx_client_payment_tokens_tenant_id
  ON client_payment_tokens (tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_payment_tokens_client_id
  ON client_payment_tokens (client_id);
CREATE INDEX IF NOT EXISTS idx_client_payment_tokens_yesh_token_id
  ON client_payment_tokens (yesh_token_id);

-- RLS: tenants may only read/write their own rows
ALTER TABLE client_payment_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_payment_tokens_tenant_isolation ON client_payment_tokens;
CREATE POLICY client_payment_tokens_tenant_isolation
  ON client_payment_tokens
  USING (tenant_id = auth.uid());

-- ── 5. RLS on invoices and webhook_events ───────────────────────────────────

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_tenant_isolation ON invoices;
CREATE POLICY invoices_tenant_isolation
  ON invoices USING (tenant_id = auth.uid());

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_events_service_only ON webhook_events;
CREATE POLICY webhook_events_service_only
  ON webhook_events USING (FALSE);  -- edge functions bypass RLS via service role
