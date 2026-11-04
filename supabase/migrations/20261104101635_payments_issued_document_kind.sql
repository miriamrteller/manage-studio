-- Which tax document was actually issued for a payment (accountant export, PR1).
--
-- The finance page and the accountant export show the VAT split from the document
-- that was issued, never from business status (owner rule, PAYMENTS-AUDIT.md
-- "Business status must not change what our app does"):
--   receipt             קבלה                no VAT on the document
--   tax_invoice_receipt חשבונית מס-קבלה      VAT included in the total
--   credit_note         חשבונית זיכוי        refund / credit document
-- NULL means we don't know: the provider issued it and didn't tell us the type
-- (Grow, iCount, Invoice4U), or no document exists yet.
--
-- Additive: a nullable column, no behaviour change for existing code.
-- The legacy payments.document_type column (never written) is left alone.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS issued_document_kind TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_issued_document_kind_check') THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_issued_document_kind_check
      CHECK (issued_document_kind IS NULL OR issued_document_kind IN ('receipt', 'tax_invoice_receipt', 'credit_note'));
  END IF;
END $$;

COMMENT ON COLUMN payments.issued_document_kind IS
  'Tax document actually issued: receipt, tax_invoice_receipt or credit_note. NULL = unknown (the provider did not say) or none yet. Set when the document is recorded; never derived from business status.';

-- Backfill documents that already exist, from what we sent the provider.
-- YPay: the studio's explicit document setting (108 receipt, otherwise 109).
UPDATE payments p
SET issued_document_kind = CASE
    WHEN t.ypay_document_type = 108 THEN 'receipt'
    ELSE 'tax_invoice_receipt'
  END
FROM tenants t
WHERE t.id = p.tenant_id
  AND p.issued_document_kind IS NULL
  AND p.external_document_id IS NOT NULL
  AND p.provider = 'ypay'
  AND p.charge_type <> 'refund';

-- Standalone documents for cash / bank / Bit money come from the studio's invoicing service.
-- Green Invoice always issues 320 (tax invoice-receipt) for a sale and 330 (credit) for a refund;
-- YPay issues its document setting.
UPDATE payments p
SET issued_document_kind = CASE
    WHEN t.invoicing_provider = 'green_invoice' AND p.charge_type = 'refund' THEN 'credit_note'
    WHEN t.invoicing_provider = 'green_invoice' THEN 'tax_invoice_receipt'
    WHEN t.invoicing_provider = 'ypay' AND t.ypay_document_type = 108 THEN 'receipt'
    WHEN t.invoicing_provider = 'ypay' THEN 'tax_invoice_receipt'
  END
FROM tenants t
WHERE t.id = p.tenant_id
  AND p.issued_document_kind IS NULL
  AND p.external_document_id IS NOT NULL
  AND p.provider = 'manual'
  AND t.invoicing_provider IN ('green_invoice', 'ypay')
  AND NOT (t.invoicing_provider = 'ypay' AND p.charge_type = 'refund');
