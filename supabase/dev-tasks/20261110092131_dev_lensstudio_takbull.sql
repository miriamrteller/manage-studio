-- DEV ONLY (run by the dev-task workflow on the dev project, never on prod).
--
-- The owner asked (10 Nov 2026) for Lens Studio on dev to take payments through Takbull, so she
-- can make a real sandbox test payment (Takbull allows test charges up to 5 ILS). Its Takbull
-- sandbox keys are already saved and Test connection passed. Studio admins can't pick Takbull in
-- Settings yet (it shows "Coming soon"), so this sets it directly:
--   payment_provider = 'takbull' and invoicing_provider = 'takbull' (Takbull issues the receipt
--   with the charge), only for subdomain lensstudio, and only if its Takbull keys are saved.
--
-- The first dry run (10 Nov) failed with no detail shown, so this version prints counts and
-- never raises. Check the dry-run counts before the real run.
-- To undo later: a new dev task setting both back (or the platform owner in Platform).

-- Diagnostics first (row counts only; rows are never printed):
--   1. the lensstudio studio exists (expect 1 row);
--   2. it has Takbull keys saved (expect 1 row; 0 means the keys were saved on another studio);
--   3. how many studios have Takbull keys saved at all.
SELECT 1 FROM tenants WHERE subdomain = 'lensstudio';
SELECT 1 FROM tenants WHERE subdomain = 'lensstudio'
   AND takbull_api_key_enc IS NOT NULL AND takbull_api_secret_enc IS NOT NULL;
SELECT 1 FROM tenants WHERE takbull_api_key_enc IS NOT NULL AND takbull_api_secret_enc IS NOT NULL;

-- Then the change. Expected: UPDATE 1 (UPDATE 0 if lensstudio has no keys yet; nothing fails,
-- so the counts above always show).
UPDATE tenants
   SET payment_provider = 'takbull',
       invoicing_provider = 'takbull'
 WHERE subdomain = 'lensstudio'
   AND takbull_api_key_enc IS NOT NULL
   AND takbull_api_secret_enc IS NOT NULL;
