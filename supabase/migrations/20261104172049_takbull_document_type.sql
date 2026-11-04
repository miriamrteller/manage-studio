-- =============================================================================
-- Takbull, PR 2 (docs/plans/TAKBULL-INTEGRATION.md): which document Takbull issues with a
-- studio's card payments. 400 = receipt (קבלה), 320 = tax invoice-receipt (חשבונית מס קבלה).
--
-- Same rule as Green Invoice (#340), per the owner's decision (a per-provider column):
-- prefilled from business status, then only the owner changes it; a later change of business
-- status never switches it. Takbull is to be the default for every new studio, so every new
-- studio gets the prefill at creation (not only ones created on Takbull).
-- Mapping: private.green_invoice_type_for_status (exempt dealer / not registered → 400,
-- licensed dealer / company / unknown → 320). [[ACCOUNTANT: confirm]] (row 17 of the review list).
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS takbull_document_type SMALLINT NOT NULL DEFAULT 320;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_takbull_document_type_check') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_takbull_document_type_check CHECK (takbull_document_type IN (400, 320));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.prefill_takbull_document_type()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.takbull_document_type := private.green_invoice_type_for_status(NEW.legal_profile ->> 'business_status');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_prefill_takbull_document_type ON tenants;
CREATE TRIGGER tenants_prefill_takbull_document_type
  BEFORE INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION private.prefill_takbull_document_type();

-- Existing studios get the same prefill once (none is on Takbull yet).
UPDATE tenants
SET takbull_document_type = private.green_invoice_type_for_status(legal_profile ->> 'business_status');

COMMENT ON COLUMN tenants.takbull_document_type IS
  'Takbull document type for card payments: 400 receipt, 320 tax invoice-receipt. Prefilled from business status at creation; then only the owner changes it.';

GRANT SELECT (takbull_document_type) ON TABLE tenants TO authenticated;

-- =============================================================================
-- takbull_orders: the charge details behind each Takbull order, kept on our side.
-- Takbull returns only our order_reference (the payment id) and its own ids, so what a
-- settle needs (the charge metadata, whether to keep the card, the month a renewal pays) is
-- stored here when the order is created. Edge Functions (service role) only.
-- =============================================================================
CREATE TABLE IF NOT EXISTS takbull_orders (
  payment_id   UUID        PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
  tenant_id    UUID        NOT NULL REFERENCES tenants(id),
  uniq_id      TEXT        UNIQUE,
  metadata     JSONB       NOT NULL,
  save_card    BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE takbull_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE takbull_orders FROM anon, authenticated;
GRANT ALL ON TABLE takbull_orders TO service_role;

COMMENT ON TABLE takbull_orders IS
  'Takbull orders: charge metadata, save-card flag and Takbull order id per pending payment. Service role only.';
