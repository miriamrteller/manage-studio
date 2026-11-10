-- DEV ONLY (run by the dev-task workflow on the dev project, never on prod).
--
-- The owner asked (10 Nov 2026) for Lens Studio on dev to take payments through Takbull with the
-- Takbull sandbox keys. The sandbox keys were saved on dev under one other studio, not Lens Studio
-- (dry run of the earlier task: lensstudio 0 rows with keys, 1 studio with keys). This task:
--   1. shows which seeded studio holds the keys (row counts only, one line per studio);
--   2. copies the encrypted key and secret, as they are, from that one studio to lensstudio
--      (same database, same encryption key, so nothing is decrypted or printed);
--   3. switches lensstudio to payment_provider = 'takbull' and invoicing_provider = 'takbull'.
-- The other studio keeps its copy and its provider. Copies only when exactly one studio has keys.
-- Expected after the counts: UPDATE 1 (keys copied), UPDATE 1 (lensstudio on Takbull).
-- Replaces 20261110092131_dev_lensstudio_takbull.sql, which never ran (its dry runs kept nothing).

-- 1. Which studio holds the keys (expect 1 row on exactly one line).
SELECT 1 FROM tenants WHERE subdomain = 'creativeballet' AND takbull_api_key_enc IS NOT NULL;
SELECT 1 FROM tenants WHERE subdomain = 'belladance' AND takbull_api_key_enc IS NOT NULL;
SELECT 1 FROM tenants WHERE subdomain = 'lensstudio' AND takbull_api_key_enc IS NOT NULL;
SELECT 1 FROM tenants WHERE subdomain = 'velvetbeauty' AND takbull_api_key_enc IS NOT NULL;
SELECT 1 FROM tenants WHERE subdomain = 'artclass' AND takbull_api_key_enc IS NOT NULL;
SELECT 1 FROM tenants WHERE subdomain NOT IN ('creativeballet', 'belladance', 'lensstudio', 'velvetbeauty', 'artclass')
   AND takbull_api_key_enc IS NOT NULL;

-- 2. Copy the encrypted keys to lensstudio, only when exactly one other studio has them.
WITH src AS (
  SELECT takbull_api_key_enc, takbull_api_secret_enc, takbull_credentials_updated_at
    FROM tenants
   WHERE subdomain <> 'lensstudio'
     AND takbull_api_key_enc IS NOT NULL AND takbull_api_secret_enc IS NOT NULL
)
UPDATE tenants t
   SET takbull_api_key_enc = src.takbull_api_key_enc,
       takbull_api_secret_enc = src.takbull_api_secret_enc,
       takbull_credentials_updated_at = now()
  FROM src
 WHERE t.subdomain = 'lensstudio'
   AND (SELECT count(*) FROM src) = 1;

-- 3. Lens Studio takes payments and issues receipts through Takbull (only if it now has keys).
UPDATE tenants
   SET payment_provider = 'takbull',
       invoicing_provider = 'takbull'
 WHERE subdomain = 'lensstudio'
   AND takbull_api_key_enc IS NOT NULL
   AND takbull_api_secret_enc IS NOT NULL;
