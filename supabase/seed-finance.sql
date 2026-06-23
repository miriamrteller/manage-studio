-- Finance module dev fixtures (Flows A–G smoke / manual QA)
-- Requires Stage 1 finance schema (payment_provider, billing_accounts.account_id,
-- payments.external_document_*, no invoice_sequences).
--
-- Run AFTER supabase/seed.sql on linked dev:
--   1. reset_dev_db.sql (if full rebuild)
--   2. pnpm db:sync
--   3. supabase/seed.sql
--   4. this file
--
-- Test matrix (creativeballet tenant):
-- | Fixture | Flow | How to use |
-- | pending Esther → Mini (301) | A card pay | Login parent miriamrstern@gmail.com → pay engagement |
-- | pending Sara → Pilates (309) | A adult self-pay | Guest or admin; waiver already signed |
-- | pending Esther → Monthly Primary (310) | B recurring initial | Pay + save card + schedule |
-- | active Ruti + payment 1101 | E refund, parent portal | Admin refund; parent sees receipt |
-- | offering 311 ₪1 no waiver | A smoke | Cheapest happy path |
-- | tenant grow/grow + demo creds | G | Use with GROW_MOCK=true (Edge secret); no live Meshulam calls |
--
-- Renewals (Flow C): not pre-seeded — create via Stage 6 after recurring enrol or cron test.
--
-- Walkthrough (dev only): /admin/dev/finance-walkthrough
--   Lists the scenarios above and inspects the payment → document → email pipeline per
--   engagement. Enable outside dev builds with VITE_ENABLE_FINANCE_WALKTHROUGH=true.

-- ============================================================================
-- DEV ENCRYPTION KEY — stored in private.platform_config (migration
-- 20260622000000_app_encryption_key_platform_config.sql). On hosted Supabase,
-- ALTER DATABASE SET app.encryption_key is permission-denied; the table fallback
-- is used instead. Production can still override via the GUC runbook.
-- ============================================================================

-- ============================================================================
-- TENANT — Grow bundled provider with Meshulam documentation demo credentials.
-- Pair with Supabase secret GROW_MOCK=true so Edge Functions use MockGrowPaymentProvider
-- and never hit the live sandbox API. Real sandbox creds replace these when ready.
-- ============================================================================
UPDATE tenants
SET
  payment_provider             = 'grow',
  invoicing_provider           = 'grow',
  payment_provider_account_id  = '4ec1d595ae764243',
  payment_provider_public_key  = 'b73ca07591f8',
  payment_provider_secret_enc  = pgp_sym_encrypt(
    'grow-mock-dev-key-00000000',
    '0uT6CrQXiMJab+raSRxxx0j7ZLYvwKCb2HCoQusCfiY='
  ),
  payment_provider_updated_at  = now()
WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ============================================================================
-- OFFERINGS — recurring + ₪1 smoke offering
-- ============================================================================
INSERT INTO offerings (
  id, tenant_id, season_id, category_id, name,
  day_of_week, start_time, end_time,
  min_age, max_age,
  max_capacity, price_minor, currency, delivery_mode, billing_mode, billing_interval,
  waiver_required, is_public, status
)
VALUES
  (
    '00000000-0000-0000-0000-000000000310'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000203'::uuid,
    'Primary (Monthly)',
    2, '17:00:00', '17:45:00',
    5, 7,
    20, 24000, 'ILS', 'scheduled', 'recurring', 'monthly',
    true, true, 'active'
  ),
  (
    '00000000-0000-0000-0000-000000000311'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000201'::uuid,
    'Finance Smoke (₪1)',
    NULL, '00:00:00', '00:00:00',
    NULL, NULL,
    99, 100, 'ILS', 'intangible', 'one_time', NULL,
    false, true, 'active'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_minor = EXCLUDED.price_minor,
  billing_mode = EXCLUDED.billing_mode,
  billing_interval = EXCLUDED.billing_interval,
  waiver_required = EXCLUDED.waiver_required,
  delivery_mode = EXCLUDED.delivery_mode,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  min_age = EXCLUDED.min_age,
  max_age = EXCLUDED.max_age,
  status = EXCLUDED.status;

-- ============================================================================
-- BILLING ACCOUNT — Stern household (account_id + payer person_id)
-- ============================================================================
INSERT INTO billing_accounts (
  id, tenant_id, account_id, person_id, business_tax_id, business_name, status
)
VALUES (
  '00000000-0000-0000-0000-000000000408'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000401'::uuid,
  '00000000-0000-0000-0000-000000000504'::uuid,
  NULL,
  NULL,
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  person_id = EXCLUDED.person_id,
  status = EXCLUDED.status;

-- Optional B2B buyer fields (uncomment to test GI buyer tax ID path):
-- UPDATE billing_accounts SET business_tax_id = '514567890', business_name = 'Stern Family Ltd'
-- WHERE id = '00000000-0000-0000-0000-000000000408'::uuid;

-- ============================================================================
-- WAIVER — Esther Stern for Mini (301) so checkout can proceed
-- ============================================================================
INSERT INTO waiver_evidence (
  id, tenant_id, person_id, account_member_id, offering_id,
  consent_template_id, consent_version, consent_version_hash, wording_snapshot,
  pdf_storage_path, pdf_sha256, record_hmac, hmac_key_version, viewed_at,
  signed_by_name, signed_by_email, signed_by_role, signature_method,
  guardian_confirmed, signed_at, ip_address, user_agent, accept_language,
  idempotency_key, otp_verify_sid, status, created_at
)
SELECT
  '00000000-0000-0000-0000-000000000902'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000501'::uuid,
  '00000000-0000-0000-0000-000000000701'::uuid,
  '00000000-0000-0000-0000-000000000301'::uuid,
  ct.id,
  ct.version,
  ct.version_hash,
  ct.content,
  '00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000501/00000000-0000-0000-0000-000000000902.pdf',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  1,
  now() - interval '1 hour',
  'Miriam R Stern',
  'miriamrstern@gmail.com',
  'guardian',
  'typed_name_checkbox',
  true,
  now() - interval '55 minutes',
  '203.0.113.43'::inet,
  'Mozilla/5.0 (seed-finance)',
  'he-IL',
  'seed-esther-mini-waiver-v1',
  NULL,
  'signed',
  now()
FROM consent_templates ct
WHERE ct.id = '00000000-0000-0000-0000-000000000801'::uuid
ON CONFLICT (id) DO NOTHING;

-- Recurring offering waiver for Esther (310)
INSERT INTO waiver_evidence (
  id, tenant_id, person_id, account_member_id, offering_id,
  consent_template_id, consent_version, consent_version_hash, wording_snapshot,
  pdf_storage_path, pdf_sha256, record_hmac, hmac_key_version, viewed_at,
  signed_by_name, signed_by_email, signed_by_role, signature_method,
  guardian_confirmed, signed_at, ip_address, user_agent, accept_language,
  idempotency_key, otp_verify_sid, status, created_at
)
SELECT
  '00000000-0000-0000-0000-000000000903'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000501'::uuid,
  '00000000-0000-0000-0000-000000000701'::uuid,
  '00000000-0000-0000-0000-000000000310'::uuid,
  ct.id,
  ct.version,
  ct.version_hash,
  ct.content,
  '00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000501/00000000-0000-0000-0000-000000000903.pdf',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  1,
  now() - interval '1 hour',
  'Miriam R Stern',
  'miriamrstern@gmail.com',
  'guardian',
  'typed_name_checkbox',
  true,
  now() - interval '55 minutes',
  '203.0.113.43'::inet,
  'Mozilla/5.0 (seed-finance)',
  'he-IL',
  'seed-esther-recurring-waiver-v1',
  NULL,
  'signed',
  now()
FROM consent_templates ct
WHERE ct.id = '00000000-0000-0000-0000-000000000801'::uuid
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- ENGAGEMENTS
-- ============================================================================
INSERT INTO engagements (
  id, tenant_id, person_id, offering_id, season_id, billing_account_id,
  waiver_evidence_id, status, billing_status, payment_received_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000001001'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000501'::uuid,
    '00000000-0000-0000-0000-000000000301'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000408'::uuid,
    '00000000-0000-0000-0000-000000000902'::uuid,
    'pending_payment',
    NULL,
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000001002'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000503'::uuid,
    '00000000-0000-0000-0000-000000000309'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    NULL,
    '00000000-0000-0000-0000-000000000901'::uuid,
    'pending_payment',
    NULL,
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000001003'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000502'::uuid,
    '00000000-0000-0000-0000-000000000302'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000408'::uuid,
    NULL,
    'active',
    'current',
    now() - interval '7 days'
  ),
  (
    '00000000-0000-0000-0000-000000001004'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000501'::uuid,
    '00000000-0000-0000-0000-000000000310'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid,
    '00000000-0000-0000-0000-000000000408'::uuid,
    '00000000-0000-0000-0000-000000000903'::uuid,
    'pending_payment',
    NULL,
    NULL
  )
ON CONFLICT (id) DO UPDATE SET
  billing_account_id = EXCLUDED.billing_account_id,
  waiver_evidence_id = EXCLUDED.waiver_evidence_id,
  status = EXCLUDED.status,
  billing_status = EXCLUDED.billing_status,
  payment_received_at = EXCLUDED.payment_received_at;

-- ============================================================================
-- PAYMENT — succeeded Pre-Primary (Ruti) for parent portal + refund testing
-- VAT-inclusive ₪240 (24000 minor), rate 17%
-- ============================================================================
INSERT INTO payments (
  id, tenant_id, account_id, person_id, offering_id, engagement_id,
  charge_type, provider, provider_payment_ref, payment_method,
  billing_account_id,
  pretax_amount_minor, vat_rate, vat_amount_minor, total_amount_minor, currency,
  external_document_id, external_document_number, invoice_url, invoice_issued_at,
  status, description, paid_at
)
VALUES (
  '00000000-0000-0000-0000-000000001101'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000401'::uuid,
  '00000000-0000-0000-0000-000000000502'::uuid,
  '00000000-0000-0000-0000-000000000302'::uuid,
  '00000000-0000-0000-0000-000000001003'::uuid,
  'initial',
  'mock',
  'mock_pi_seed_ruti_preprimary_001',
  'card',
  '00000000-0000-0000-0000-000000000408'::uuid,
  20513,
  0.17,
  3487,
  24000,
  'ILS',
  'mock_doc_seed_1101',
  'MOCK-2026-0001',
  'https://example.dev/receipts/mock-2026-0001.pdf',
  now() - interval '7 days',
  'succeeded',
  'Seed payment — Ruti Pre-Primary',
  now() - interval '7 days'
)
ON CONFLICT (id) DO UPDATE SET
  external_document_id = EXCLUDED.external_document_id,
  external_document_number = EXCLUDED.external_document_number,
  invoice_url = EXCLUDED.invoice_url,
  status = EXCLUDED.status;

-- Document queue row (already succeeded — mirrors post-worker state)
INSERT INTO document_queue (
  id, tenant_id, payment_id, document_kind, attempts, status, succeeded_at, scheduled_for
)
VALUES (
  '00000000-0000-0000-0000-000000001201'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000001101'::uuid,
  'sale',
  1,
  'succeeded',
  now() - interval '7 days',
  now() - interval '7 days'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  succeeded_at = EXCLUDED.succeeded_at;
