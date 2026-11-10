-- DEV ONLY (run by the dev-task workflow on the dev project, never on prod).
--
-- The owner asked (10 Nov 2026) for Lens Studio on dev to take payments through Takbull, so she
-- can make a real sandbox test payment (Takbull allows test charges up to 5 ILS). Its Takbull
-- sandbox keys are already saved and Test connection passed. Studio admins can't pick Takbull in
-- Settings yet (it shows "Coming soon"), so this sets it directly:
--   payment_provider = 'takbull' and invoicing_provider = 'takbull' (Takbull issues the receipt
--   with the charge), only for subdomain lensstudio, and only if its Takbull keys are saved.
--
-- Expected: UPDATE 1, then the check passes. Anything else rolls the whole file back.
-- To undo later: a new dev task setting both back (or the platform owner in Platform).

UPDATE tenants
   SET payment_provider = 'takbull',
       invoicing_provider = 'takbull'
 WHERE subdomain = 'lensstudio'
   AND takbull_api_key_enc IS NOT NULL
   AND takbull_api_secret_enc IS NOT NULL;

DO $$
BEGIN
  IF (SELECT count(*) FROM tenants
       WHERE subdomain = 'lensstudio'
         AND payment_provider = 'takbull'
         AND invoicing_provider = 'takbull') <> 1 THEN
    RAISE EXCEPTION 'dev_lensstudio_takbull: lensstudio is not on Takbull (are its Takbull keys saved?)';
  END IF;
END $$;
