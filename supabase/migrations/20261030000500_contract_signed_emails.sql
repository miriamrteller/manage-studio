-- =============================================================================
-- 000500: Signed-contract emails (photographer Thread G)
--
-- When a client signs a shoot contract, accept-waiver emails the signed PDF to
-- the client and to the photographer. Both sends go through the existing
-- claim_automatic_email / complete_automatic_email ledger so a retry or a
-- double submit never sends twice. The ledger's email_key CHECKs only knew the
-- five scheduled emails; this adds the two contract keys.
--
-- They are deliberately absent from the admin "automatic emails" toggles: a
-- copy of a signed contract is not optional. is_automatic_email_enabled()
-- returns true for keys without a tenant_automatic_emails row.
-- DEPENDENCIES: 20261030000300_quotes.sql
-- =============================================================================

ALTER TABLE tenant_automatic_emails
  DROP CONSTRAINT IF EXISTS tenant_automatic_emails_email_key_check;
ALTER TABLE tenant_automatic_emails
  ADD CONSTRAINT tenant_automatic_emails_email_key_check CHECK (email_key IN
    ('quote_sent', 'booking_confirmed', 'shoot_reminder', 'shoot_thank_you', 'gallery_ready',
     'contract_signed_client', 'contract_signed_studio'));

ALTER TABLE automatic_email_log
  DROP CONSTRAINT IF EXISTS automatic_email_log_email_key_check;
ALTER TABLE automatic_email_log
  ADD CONSTRAINT automatic_email_log_email_key_check CHECK (email_key IN
    ('quote_sent', 'booking_confirmed', 'shoot_reminder', 'shoot_thank_you', 'gallery_ready',
     'contract_signed_client', 'contract_signed_studio'));

COMMENT ON TABLE automatic_email_log IS
  'One row per (email_key, quote|engagement): the at-most-once ledger for automatic emails, including the signed-contract copies (contract_signed_client / contract_signed_studio, keyed by engagement).';

-- ---------------------------------------------------------------------------
-- PDF failure policy. A render or storage failure at signing must never block
-- a client from signing: accept-waiver then seals the row with the V1 sentinel
-- pair (exactly like a dance waiver), flags the shoot and logs it. The admin
-- "Generate PDF" retry renders from the sealed wording_snapshot afterwards and
-- stores the result HERE, never on waiver_evidence (immutable, and its
-- record_hmac seals the sentinel). A row here is therefore documented as
-- "generated after signing": it reproduces the sealed wording but its hash is
-- not part of the sealed record.
-- ---------------------------------------------------------------------------

ALTER TABLE job_details
  ADD COLUMN IF NOT EXISTS contract_pdf_pending BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN job_details.contract_pdf_pending IS
  'True when the contract was signed but its PDF could not be rendered or stored at signing (evidence row carries the sentinels). Cleared by job-contract-pdf-generate.';

CREATE TABLE IF NOT EXISTS waiver_evidence_pdfs (
  waiver_evidence_id UUID        PRIMARY KEY REFERENCES waiver_evidence(id),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id),
  pdf_storage_path   TEXT        NOT NULL,
  pdf_sha256         VARCHAR(64) NOT NULL,
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by       UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  reason             TEXT        NOT NULL DEFAULT 'generated_after_signing'
                     CHECK (reason IN ('generated_after_signing'))
);
COMMENT ON TABLE waiver_evidence_pdfs IS
  'PDFs generated AFTER signing for evidence rows whose sealed pdf_storage_path is the sentinel. Rendered from the sealed wording_snapshot; the hash here is not covered by record_hmac.';

CREATE INDEX IF NOT EXISTS idx_waiver_evidence_pdfs_tenant ON waiver_evidence_pdfs(tenant_id);

ALTER TABLE waiver_evidence_pdfs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waiver_evidence_pdfs_service ON waiver_evidence_pdfs;
CREATE POLICY waiver_evidence_pdfs_service ON waiver_evidence_pdfs FOR ALL
  USING (is_service_role()) WITH CHECK (is_service_role());

-- Admins may read their tenant's rows (the shoot page shows PDF state);
-- downloads still go through job-contract-pdf-link.
DROP POLICY IF EXISTS waiver_evidence_pdfs_admin_select ON waiver_evidence_pdfs;
CREATE POLICY waiver_evidence_pdfs_admin_select ON waiver_evidence_pdfs FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND 'tenant_admin' = ANY(role))
  );

GRANT SELECT ON waiver_evidence_pdfs TO authenticated;
GRANT ALL ON waiver_evidence_pdfs TO service_role;
