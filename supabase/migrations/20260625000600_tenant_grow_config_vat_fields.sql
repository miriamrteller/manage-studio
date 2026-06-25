-- =============================================================================
-- 000600: Tenant Grow VAT config fields
-- Adds invoice_license_number and vat_type to the tenants table.
-- Gap 2 closure per CN-GROW-002-REV (Osek Patur — correct pass-through fields).
--
-- Tax Delegation Doctrine: OpalSwift passes these values to Grow as-is.
-- No VAT computation, no derivation, no validation. Grow owns invoice legality.
--
-- DEPENDENCIES: 20260608000200_core_tenants.sql (tenants table)
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS invoice_license_number TEXT    NULL,
  ADD COLUMN IF NOT EXISTS vat_type               INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN tenants.invoice_license_number IS
  'Tenant business license / tax ID (ח.פ or ת.ז) printed on Grow-issued invoices. '
  'Passed to Grow as pageField[invoiceLicenseNumber] — pure pass-through, no validation. '
  'NULL = field is omitted from the Grow payload entirely.';

COMMENT ON COLUMN tenants.vat_type IS
  'Grow vatType code for productData[N][vatType]: '
  '1 = VAT included (default), 2 = before VAT, 3 = exempt (Osek Patur). '
  'Passed to Grow as-is — pure pass-through. Grow owns VAT document legality.';
