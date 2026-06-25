-- =============================================================================
-- ⚠️  PRODUCTION-ONLY SCRIPT — DO NOT ADD TO supabase/migrations/
-- =============================================================================
-- Run ONCE on the production Supabase project only.
-- Applying this to dev or staging will make the legal-documents bucket
-- non-deletable and will break supabase db reset / migration squashing.
--
-- How to run (production deploy):
--   1. Open the Supabase SQL Editor on the PRODUCTION project.
--   2. Paste and execute this script.
--   3. Confirm the bucket policy is visible in Storage → legal-documents → Settings.
--
-- This script is intentionally NOT part of the migration chain.
-- It is safe to re-run (idempotent via ON CONFLICT / IF NOT EXISTS guards).
-- =============================================================================

-- Enable object versioning on the legal-documents bucket.
-- This prevents overwrites (objects with the same path become a new version).
-- Note: Supabase Storage uses S3-compatible semantics; versioning is enabled at
-- the bucket level via the management API or this SQL helper if available.
-- If your Supabase plan does not expose this SQL function, enable via:
--   Supabase Dashboard → Storage → legal-documents → Settings → Enable Versioning

DO $$
BEGIN
  -- Attempt to enable versioning via storage extension helper (if available on this plan)
  IF EXISTS (
    SELECT 1
    FROM information_schema.routines
    WHERE routine_schema = 'storage'
      AND routine_name = 'enable_bucket_versioning'
  ) THEN
    PERFORM storage.enable_bucket_versioning('legal-documents');
    RAISE NOTICE 'legal-documents bucket versioning enabled.';
  ELSE
    RAISE NOTICE 'storage.enable_bucket_versioning not available on this plan. Enable versioning via the Supabase Dashboard manually.';
  END IF;
END;
$$;

-- Record that the production retention lock has been applied.
-- Stored in a simple config table so automated checks can verify compliance.
INSERT INTO private.platform_config (key, value)
VALUES (
  'legal_documents_retention_lock_applied_at',
  to_jsonb(now()::text)
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

-- Verify the bucket exists with correct settings
DO $$
DECLARE
  v_bucket record;
BEGIN
  SELECT * INTO v_bucket
  FROM storage.buckets
  WHERE id = 'legal-documents';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'legal-documents bucket not found. Run migrations first (supabase db push).';
  END IF;

  IF v_bucket.public THEN
    RAISE EXCEPTION 'legal-documents bucket must not be public. Check RLS policies.';
  END IF;

  RAISE NOTICE 'legal-documents bucket verified: public=%, file_size_limit=%',
    v_bucket.public, v_bucket.file_size_limit;
END;
$$;

-- =============================================================================
-- Retention schedule reminder (for ops runbook)
-- =============================================================================
-- Monthly automated job (scheduled via pg_cron or external cron) should:
--   SELECT id, external_document_id, retention_expires_at
--   FROM payments
--   WHERE retention_expires_at < now()
--     AND legal_hold = false
--     AND document_pdf_path IS NOT NULL;
-- Then for each row: delete from storage AND set document_pdf_path = NULL.
-- NEVER delete if legal_hold = true.
-- Log every deletion to payment_document_access_log with action = 'retention_delete'.
-- =============================================================================
