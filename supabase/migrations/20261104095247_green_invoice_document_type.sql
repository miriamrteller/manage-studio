-- Which document does Green Invoice issue for this studio? An explicit choice, like YPay's
-- (20261102125213_ypay_document_type): 400 = receipt (קבלה), 320 = tax invoice-receipt
-- (חשבונית מס קבלה). Until now every Green Invoice sale got 320, which an exempt dealer
-- (עוסק פטור) can't issue.
--
-- Prefilled, never switched: it is prefilled from business status (legal_profile.business_status)
-- when a studio is created on Green Invoice or picks it in Settings. After that only the owner
-- changes it, in Settings; a later change of business status never touches it. [[ACCOUNTANT: confirm]] the status mapping.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS green_invoice_document_type SMALLINT NOT NULL DEFAULT 320;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_green_invoice_document_type_check') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_green_invoice_document_type_check CHECK (green_invoice_document_type IN (400, 320));
  END IF;
END $$;

-- Exempt dealers and studios not yet registered issue a receipt; licensed dealers and
-- companies a tax invoice-receipt. Unknown status keeps the old behaviour (320).
CREATE OR REPLACE FUNCTION private.green_invoice_type_for_status(p_status TEXT)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (CASE WHEN p_status IN ('osek_patur', 'not_registered') THEN 400 ELSE 320 END)::SMALLINT;
$$;

REVOKE EXECUTE ON FUNCTION private.green_invoice_type_for_status(TEXT) FROM PUBLIC, anon, authenticated;

-- A studio created on Green Invoice (signup, provisioning) gets the prefill here. A studio that
-- moves to Green Invoice later gets it in Settings, where the form shows the suggested type and
-- saves it as the owner's choice (a trigger can't tell "chose 320" from "320 already stored").
CREATE OR REPLACE FUNCTION private.prefill_green_invoice_document_type()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invoicing_provider = 'green_invoice' THEN
    NEW.green_invoice_document_type :=
      private.green_invoice_type_for_status(NEW.legal_profile ->> 'business_status');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_prefill_green_invoice_document_type ON tenants;
CREATE TRIGGER tenants_prefill_green_invoice_document_type
  BEFORE INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION private.prefill_green_invoice_document_type();

-- Studios already on Green Invoice get the same prefill once (none in production today).
UPDATE tenants
SET green_invoice_document_type = private.green_invoice_type_for_status(legal_profile ->> 'business_status')
WHERE invoicing_provider = 'green_invoice';

COMMENT ON COLUMN tenants.green_invoice_document_type IS
  'Green Invoice document type for sales: 400 receipt, 320 tax invoice-receipt. Prefilled from business status when the studio moves to Green Invoice; then only the owner changes it (Settings -> Tax documents).';

-- Settings reads it directly; writes go through the existing admin UPDATE policy on tenants.
GRANT SELECT (green_invoice_document_type) ON TABLE tenants TO authenticated;
