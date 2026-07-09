-- =============================================================================
-- 20260709000200: Yesh Invoice + Rapyd — new tables
-- Creates: invoices, webhook_events, invoice_retry_queue, client_payment_tokens
--
-- invoices  — Rapyd payment + Yesh document lifecycle tracker (separate from
--             the existing `payments` table which covers Stripe/Grow/iCount).
-- webhook_events — Rapyd inbound webhook deduplication + audit trail.
-- invoice_retry_queue — Exponential-backoff retry for failed invoice operations.
-- client_payment_tokens — Opaque Yesh JS plugin token references (PCI SAQ A;
--                          no raw card data is ever stored).
--
-- DEPENDENCIES: 000200 (core_tenants), 001100 (billing_accounts), 001600 (finance)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- invoices
-- Tracks the full Rapyd payment → Yesh invoice → ITA allocation lifecycle.
-- allocation_skip_reason: stored per HITL decision PA-01 (2026-07-09) — T-11.
--   Any fully-processed invoice with null allocation_number AND null
--   allocation_skip_reason is flagged as a QA anomaly.
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rapyd_payment_id      TEXT,
  yesh_docnum           TEXT,
  allocation_number     TEXT,
  allocation_status     TEXT        NOT NULL DEFAULT 'not_required'
                        CHECK (allocation_status IN ('not_required', 'pending', 'obtained', 'error')),
  allocation_skip_reason TEXT
                        CHECK (allocation_skip_reason IN (
                          'amount_below_threshold',
                          'b2c_invoice',
                          'cross_border',
                          'yesh_returned_null',
                          'not_applicable'
                        )),
  b2b_flag              BOOLEAN     NOT NULL DEFAULT false,
  amount                NUMERIC(12,2) NOT NULL,
  currency              CHAR(3)     NOT NULL DEFAULT 'ILS',
  status                TEXT        NOT NULL
                        CHECK (status IN (
                          'payment_pending',
                          'payment_confirmed',
                          'invoice_created',
                          'fully_invoiced',
                          'payment_failed',
                          'refunded'
                        )),
  client_name           TEXT        NOT NULL,
  client_phone          TEXT,
  line_items            JSONB       NOT NULL DEFAULT '[]'::jsonb,
  retention_expires_at  TIMESTAMPTZ NOT NULL,
  archived              BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_invoices_tenant_id
  ON invoices(tenant_id);
CREATE INDEX idx_invoices_rapyd_payment_id
  ON invoices(rapyd_payment_id)
  WHERE rapyd_payment_id IS NOT NULL;
CREATE INDEX idx_invoices_yesh_docnum
  ON invoices(yesh_docnum)
  WHERE yesh_docnum IS NOT NULL;
CREATE INDEX idx_invoices_status
  ON invoices(status);
CREATE INDEX idx_invoices_created_at
  ON invoices(created_at DESC);
CREATE INDEX idx_invoices_retention_expires_at
  ON invoices(retention_expires_at)
  WHERE archived = false;

COMMENT ON TABLE invoices IS
  'Rapyd payment + Yesh invoice lifecycle records. 7-year ITA retention enforced via retention_expires_at trigger.';
COMMENT ON COLUMN invoices.allocation_skip_reason IS
  'Per HITL-PA-01: always populated when allocation_number is null on a processed B2B invoice. Null allocation_skip_reason on a fully_invoiced B2B record flags as QA anomaly.';
COMMENT ON COLUMN invoices.retention_expires_at IS
  'ITA 7-year mandatory retention. Set by trigger on INSERT. Never modify manually.';

-- Trigger: auto-set retention_expires_at = created_at + 7 years on INSERT
CREATE OR REPLACE FUNCTION invoices_set_retention()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.retention_expires_at IS NULL THEN
    NEW.retention_expires_at := NOW() + interval '7 years';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_set_retention_trigger
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION invoices_set_retention();

-- Trigger: block delete before retention expiry (T-34)
CREATE OR REPLACE FUNCTION invoices_block_early_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.retention_expires_at > NOW() THEN
    RAISE EXCEPTION
      'ITA retention: invoice % cannot be deleted before %',
      OLD.id, OLD.retention_expires_at;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER invoices_block_early_delete_trigger
  BEFORE DELETE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION invoices_block_early_delete();

-- updated_at auto-update
CREATE OR REPLACE FUNCTION invoices_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_updated_at_trigger
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION invoices_set_updated_at();

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_super_admin ON invoices
  FOR ALL USING (is_super_admin());

CREATE POLICY invoices_service_role_all ON invoices
  FOR ALL USING (is_service_role());

CREATE POLICY invoices_tenant_admin_all ON invoices
  FOR ALL
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
-- webhook_events
-- Idempotency log + audit trail for inbound Rapyd webhooks.
-- ---------------------------------------------------------------------------
CREATE TABLE webhook_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  TEXT        UNIQUE NOT NULL,
  rapyd_event_type TEXT        NOT NULL,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ,
  outcome          TEXT        NOT NULL DEFAULT 'processing'
                   CHECK (outcome IN (
                     'processing',
                     'processed',
                     'duplicate',
                     'rejected_signature',
                     'rejected_replay',
                     'rejected_cross_tenant',
                     'dead_lettered'
                   )),
  raw_payload      JSONB       NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_idempotency_key ON webhook_events(idempotency_key);
CREATE INDEX idx_webhook_events_rapyd_event_type ON webhook_events(rapyd_event_type);
CREATE INDEX idx_webhook_events_received_at ON webhook_events(received_at DESC);
CREATE INDEX idx_webhook_events_outcome ON webhook_events(outcome);

COMMENT ON TABLE webhook_events IS
  'Idempotency deduplication and security audit trail for inbound Rapyd webhook deliveries.';

CREATE OR REPLACE FUNCTION webhook_events_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER webhook_events_updated_at_trigger
  BEFORE UPDATE ON webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION webhook_events_set_updated_at();

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_events_super_admin ON webhook_events
  FOR ALL USING (is_super_admin());

CREATE POLICY webhook_events_service_role_all ON webhook_events
  FOR ALL USING (is_service_role());

-- ---------------------------------------------------------------------------
-- invoice_retry_queue
-- Persistent exponential-backoff retry queue for failed Yesh invoice operations.
-- Processed by the run-invoice-retry edge function (pg_cron, every minute).
-- ---------------------------------------------------------------------------
CREATE TABLE invoice_retry_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  attempt_count    INTEGER     NOT NULL DEFAULT 0,
  next_retry_at    TIMESTAMPTZ NOT NULL,
  last_error_code  TEXT,
  dead_lettered_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_retry_queue_next_retry_at
  ON invoice_retry_queue(next_retry_at)
  WHERE dead_lettered_at IS NULL;
CREATE INDEX idx_retry_queue_tenant_id ON invoice_retry_queue(tenant_id);
CREATE INDEX idx_retry_queue_invoice_id ON invoice_retry_queue(invoice_id);

COMMENT ON TABLE invoice_retry_queue IS
  'Retry queue for Yesh invoice creation failures. Max 5 attempts with exponential backoff before dead-lettering.';

CREATE OR REPLACE FUNCTION invoice_retry_queue_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_retry_queue_updated_at_trigger
  BEFORE UPDATE ON invoice_retry_queue
  FOR EACH ROW
  EXECUTE FUNCTION invoice_retry_queue_set_updated_at();

ALTER TABLE invoice_retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY irq_super_admin ON invoice_retry_queue
  FOR ALL USING (is_super_admin());

CREATE POLICY irq_service_role_all ON invoice_retry_queue
  FOR ALL USING (is_service_role());

-- ---------------------------------------------------------------------------
-- client_payment_tokens
-- Stores opaque Yesh JS plugin token references for recurring billing / J5.
-- PCI DSS SAQ A: raw card data (cardNumber, cvv, expiry) is NEVER stored.
-- Only the tokenId returned by the Yesh JS plugin after client-side card entry.
-- ---------------------------------------------------------------------------
CREATE TABLE client_payment_tokens (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id      TEXT        NOT NULL,        -- Yesh clientId
  yesh_token_id  TEXT        NOT NULL,        -- Opaque token — not derivable back to PAN
  tokenised_via  TEXT        NOT NULL DEFAULT 'yesh_js_plugin'
                 CHECK (tokenised_via IN ('yesh_js_plugin', 'yesh_payment_page')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at   TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  CONSTRAINT client_payment_tokens_unique_token UNIQUE (tenant_id, yesh_token_id)
);

CREATE INDEX idx_client_payment_tokens_tenant_id
  ON client_payment_tokens(tenant_id);
CREATE INDEX idx_client_payment_tokens_client_id
  ON client_payment_tokens(client_id);
CREATE INDEX idx_client_payment_tokens_yesh_token_id
  ON client_payment_tokens(yesh_token_id);

COMMENT ON TABLE client_payment_tokens IS
  'PCI SAQ A: only opaque Yesh JS plugin tokenIds are stored. No card numbers, CVVs, or expiry dates. Ever.';
COMMENT ON COLUMN client_payment_tokens.yesh_token_id IS
  'Opaque token returned by Yesh JS plugin. Never derivable back to PAN. Never log or expose in error messages.';

ALTER TABLE client_payment_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY cpt_super_admin ON client_payment_tokens
  FOR ALL USING (is_super_admin());

CREATE POLICY cpt_service_role_all ON client_payment_tokens
  FOR ALL USING (is_service_role());

CREATE POLICY cpt_tenant_admin_all ON client_payment_tokens
  FOR ALL
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
-- pg_cron: register run-invoice-retry job (every minute)
-- Template: existing dunning job in 20260608002600_scheduled_jobs.sql
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'run-invoice-retry',
      '* * * * *',
      $$
        SELECT net.http_post(
          url    := (SELECT value FROM private.platform_config WHERE key = 'supabase_functions_url')
                    || '/run-invoice-retry',
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || (SELECT value FROM private.platform_config WHERE key = 'service_role_key')
          ),
          body   := '{}'::jsonb
        );
      $$
    );
  END IF;
END;
$$;
