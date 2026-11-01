-- Invoicing off: tenants.invoicing_provider = 'none'.
--
-- Why: a studio that is not a registered business yet (or issues receipts itself) must
-- not have the app queue tax documents. Until now every recorded payment enqueued a
-- 'sale' document for the default provider ('grow', no credentials), which retried,
-- died and emailed the admin. The slug is validated in app/Zod (no Postgres CHECK, as
-- for the other slugs); enqueueDocument() / finalisePayment() skip when it is 'none'.
--
-- Data: tenants already set to "pay at the studio" (payment_provider = 'none',
-- migration 20261101000200) default to invoicing off as well. No-op on a database
-- with no such tenant. Backward-compatible: no schema change.

COMMENT ON COLUMN tenants.invoicing_provider IS
  'Tax-document provider slug, validated in app/Zod. '
  'green_invoice|mock|grow|icount|invoice4u|ypay|tranzila|yesh|none. '
  '''none'' = invoicing off: the app never enqueues or issues a tax document; the studio '
  'issues its own receipts if it is a registered business.';

UPDATE tenants
   SET invoicing_provider = 'none'
 WHERE payment_provider = 'none'
   AND invoicing_provider = 'grow'
   AND invoicing_account_id IS NULL
   AND invoicing_api_key_enc IS NULL;
