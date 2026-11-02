-- Which document does YPay issue for this studio? An explicit choice made once in
-- Settings -> Payment, instead of being inferred from the hidden tenants.vat_type
-- (and, through it, business status). 108 = receipt (קבלה), 109 = invoice-receipt
-- (חשבונית מס-קבלה). The app sends the value unchanged.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ypay_document_type SMALLINT NOT NULL DEFAULT 109;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_ypay_document_type_check') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_ypay_document_type_check CHECK (ypay_document_type IN (108, 109));
  END IF;
END $$;

-- Keep what existing studios already get (the old rule: vat_type 3 meant a receipt).
UPDATE tenants SET ypay_document_type = 108 WHERE vat_type = 3 AND ypay_document_type <> 108;

COMMENT ON COLUMN tenants.ypay_document_type IS
  'YPay document type issued for this studio: 108 receipt, 109 invoice-receipt. Set by the owner in Settings -> Payment; never derived from business status.';

-- The settings screen reads it directly (column-level grants, like lead_form). Writes go through
-- the existing admin UPDATE policy on tenants.
GRANT SELECT (ypay_document_type) ON TABLE tenants TO authenticated;
