-- How often the studio reports VAT (accountant export, PR2): every two months or monthly.
-- Used only to prefill the accountant export's period ("last VAT period"); it never changes
-- what the app charges or which document is issued. Prefilled 'bi_monthly', editable on the
-- payments page. [[ACCOUNTANT: confirm]] the period depends on the business, not on status.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS vat_report_period TEXT NOT NULL DEFAULT 'bi_monthly';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_vat_report_period_check') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_vat_report_period_check CHECK (vat_report_period IN ('bi_monthly', 'monthly'));
  END IF;
END $$;

COMMENT ON COLUMN tenants.vat_report_period IS
  'VAT reporting period: bi_monthly (default) or monthly. Prefills the accountant export period only.';

-- Read directly by the payments page (column-level grants, like ypay_document_type). Writes go
-- through the existing admin UPDATE policy on tenants.
GRANT SELECT (vat_report_period) ON TABLE tenants TO authenticated;
