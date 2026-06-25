-- =============================================================================
-- 000400: Grow document persistence — extend payments + audit log table
-- GAP 5: Stores Grow-issued invoice document fields for legal retention (7 yr).
-- DEPENDENCIES: 001600 (payments, auth.users)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extend payments table with document persistence columns
-- (external_document_id, external_document_number, invoice_url, invoice_issued_at
-- already exist from 001600 — only new columns added here)
-- ---------------------------------------------------------------------------
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS document_stored_at   timestamptz,
  ADD COLUMN IF NOT EXISTS document_pdf_path    text,
  ADD COLUMN IF NOT EXISTS document_type        text
    CHECK (document_type IN (
      'standard_invoice',
      'credit_note',
      'osek_patur_receipt',
      'cross_border',
      'disputed'
    )),
  ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_hold           boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN payments.document_stored_at   IS 'Timestamp when Grow invoice document was first received and stored locally.';
COMMENT ON COLUMN payments.document_pdf_path    IS 'Opaque Supabase Storage key for immutable legal PDF copy in the legal-documents bucket. PII lives in the PDF only — never in indexed DB columns. (MD-004)';
COMMENT ON COLUMN payments.document_type        IS 'Determines retention period: standard_invoice/credit_note/osek_patur_receipt = 7 yr; cross_border/disputed = 10 yr. (MD-003)';
COMMENT ON COLUMN payments.retention_expires_at IS 'Auto-set on document insert by trigger. Automated deletion job never runs before this date. (MD-003)';
COMMENT ON COLUMN payments.legal_hold           IS 'When true, automated deletion is blocked regardless of retention_expires_at. Cleared only by designated custodian. (MD-006)';

-- Index for admin lookup by Grow document ID
CREATE INDEX IF NOT EXISTS idx_payments_external_document_id
  ON payments (external_document_id)
  WHERE external_document_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Trigger: auto-populate retention_expires_at on document insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION payments_set_retention_expires_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only set when a document is first stored (document_stored_at transitions NULL → non-NULL)
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

-- ---------------------------------------------------------------------------
-- Audit log: who accessed or resent each invoice document
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_document_access_log (
  id           bigserial    PRIMARY KEY,
  payment_id   uuid         NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  accessed_by  uuid         REFERENCES auth.users(id),   -- NULL for system/service-role actions
  action       text         NOT NULL DEFAULT 'view'
                            CHECK (action IN ('view', 'download', 'resend', 'legal_hold_set', 'legal_hold_released')),
  accessed_at  timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE payment_document_access_log IS '7-year legal retention: complete audit trail of who accessed, downloaded, or resent each invoice document.';

CREATE INDEX IF NOT EXISTS idx_doc_access_log_payment
  ON payment_document_access_log (payment_id);
CREATE INDEX IF NOT EXISTS idx_doc_access_log_user
  ON payment_document_access_log (accessed_by)
  WHERE accessed_by IS NOT NULL;

-- RLS: service_role + tenant admins (read own tenant's log via payment FK)
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

-- Service role inserts from edge functions
CREATE POLICY pdal_service_role_insert ON payment_document_access_log
  FOR INSERT
  WITH CHECK (is_service_role());

-- ---------------------------------------------------------------------------
-- Storage bucket for legal document PDFs
-- Created without retention lock here — see scripts/apply-production-retention-lock.sql
-- for the one-time prod-only lock. Dev environments remain fully resetable.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'legal-documents',
  'legal-documents',
  false,
  52428800,   -- 50 MB per file
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS for the legal-documents storage bucket
CREATE POLICY "legal_documents_service_role_all"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'legal-documents');

-- Admins can read (download via signed URL RPC) but not delete or overwrite
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
