# Stage G4 — Grow payment adapter, webhooks, and bundled orchestration

**Goal:** Real Grow card payments via the server-side API; invoice webhook; no double
documents.

**Agent sizing:** Largest stage (~900–1400 LOC). If context limits hit, stop after **G4a**
(payment webhook + approve only) and report a partial DoD — do not start the frontend.

## G4a — Payment path (implement first)

- Shared helper `supabase/functions/_shared/payments/grow/amount.ts`: convert `amountMinor`
  (ILS agorot) → Grow decimal string; unit-tested.
- Shared helper `supabase/functions/_shared/payments/grow/metadata.ts`: map `ChargeMetadata`
  ↔ `cField1`–`cField4` + `transactionUniqueIdentifier` (= idempotency key).
- Implement `GrowPaymentProvider.createCharge` → `createPaymentProcess`; `saveCardToken=1` on
  initial enrolment charges; `productData[]` from the offering; `pageField[email]` from the
  payer.
- Refactor `supabase/functions/handle-payment-event/index.ts`: remove the hard dependency on
  Stripe-shaped `peekTenantId` — resolve the tenant via provider `constructEvent(tenantId?)`
  or parse the Grow body before provider dispatch; support per-tenant webhook URL routing
  using `cField1`.
- `constructEvent`: parse the Grow notify → `PaymentEvent`; **always** call Approve
  Transaction before returning success.
- `create-checkout/index.ts`: return `{ pageUrl, providerPaymentRef, paymentProvider:'grow',
  pendingWebhook:true }`; never finalise on create.

## G4b — Invoice + orchestration (same stage, after G4a tests green)

- New `supabase/functions/handle-invoice-event/index.ts`: idempotent document-field upsert;
  reconcile `document_queue` (see webhook ordering spec in `00-overview.md`).
- `finalise-payment.ts`: skip `enqueueDocument` when `external_document_id` is already set on
  the payment row at finalise time (`skipDocumentEnqueue`).
- `GrowInvoicingProvider.issueDocument`: cash/manual — non-retryable error + runbook link if
  no API; do **not** silently fall back to mock in production code paths.
- Fixture files: `apps/web/src/__tests__/fixtures/grow-payment-notify.json`,
  `grow-invoice-notify.json` (redacted samples — document the source as a manual sandbox
  capture).

## Scope OUT

Frontend iframe (G5), recurring billing (G6), `saveCard` token persistence to
`payment_method_tokens` (G6 — but `saveCardToken=1` on `createCharge` belongs here).

## Tests

- `grow-webhook-parse.test.ts` — fixture payloads → `PaymentEvent`.
- `grow-approve-transaction.test.ts` — mock fetch verifies approve was called.
- `bundled-skip-enqueue.test.ts` — finalise skips the queue when a doc is present.
- `handle-invoice-event.test.ts` — idempotent document write.

## DoD checklist

- [ ] Sandbox `createPaymentProcess` returns a pageUrl (manual runbook step with real creds)
- [ ] Webhook handler unit tests pass
- [ ] No duplicate `document_queue` rows when the invoice webhook precedes finalise
- [ ] `approveTransaction` called on a successful notify

## Manual gates

Grow sandbox creds, ₪1 charge on offering 311, verify webhook receipt in Supabase logs.

## Stop condition

Report the DoD checklist (or partial after G4a) and stop. Do not start Stage G5.
