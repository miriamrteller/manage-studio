# Stage 4 — One-Time Payment Flow (End-to-End)

> **Depends on:** Stage 2 + Stage 3 (`finalise-payment` must exist).
> **Outcome:** Flow A on Mock (CI) and Stripe test mode (manual).

## Flow A

```
1. resolveOfferingPrice() → show total
2. create-checkout → getPaymentProvider(tenant).createCharge({ metadata: { charge_type: 'initial', ... } })
3. Embedded payment UI confirms charge
4. handle-payment-event:
   a. idempotency on provider_payment_ref
   b. INSERT payments (billing_account_id + charge_type from metadata / engagement)
   c. finalisePayment({ chargeType: 'initial' }) → engagement activation, audit, enqueueDocument(sale), email
5. issue-document worker → external_document_* + invoice_url
6. Parent portal shows receipt fields once worker completes (may lag email by seconds/minutes)
```

## Frontend

- `EnrolmentPaymentForm.tsx`, `prepareEnrolmentCheckout.ts`, checkout steps — generic provider handling.

### Parent portal — migrate off `invoice_number` (locked)

Stage 1 drops `payments.invoice_number`. Update parent-facing payment history:

| File | Change |
| --- | --- |
| `apps/web/src/components/Dashboard/useParentPortal.ts` | Select `external_document_number`, `invoice_url` instead of `invoice_number` |
| `apps/web/src/components/Dashboard/ParentPortal.tsx` | Receipt column: show `external_document_number` with link to `invoice_url` when present; `'—'` while document worker pending |

Types regenerate from Stage 1 reset — remove `invoice_number` from local interfaces.

## Notes

- One-time offering → `billing_status='current'`. Recurring schedule → Stage 6 via finalise hook.
- Enqueue `documentKind: 'sale'` only; adapter picks legal document type.
- Document enqueue idempotency: unique index on queue + finalise guard.
- Guest enrolment RPC (Stage 1) must wire `billing_accounts.account_id` before first payment so
  saved cards and renewals attach to the correct household billing home.

## Definition of Done

- [ ] Mock automated E2E: payment, engagement active, one queue row, external fields after worker.
- [ ] Parent portal shows `external_document_number` / `invoice_url` (not `invoice_number`).
- [ ] Stripe test runbook documented.
- [ ] Declined card → no payment row.
- [ ] Idempotent webhook + idempotent document enqueue.
- [ ] Waiver gate preserved via finalise-payment (`initial` branch only).
- [ ] Committed; `main` green.

## Test cases

1. Happy path (mock).
2. Declined payment.
3. Duplicate webhook.
4. Waiver unsigned → pending_waiver.
5. VAT matches resolveOfferingPrice().
6. `billing_account_id` copied from engagement/metadata to payment.
7. Parent portal: paid row shows document number after worker; pending document shows `'—'`.

## Production smoke-test runbook

1. Configure invoicing + payment credentials per tenant.
2. ₪1 offering → enrol + pay.
3. Verify payment, engagement, document in provider dashboard.
4. Parent portal receipt column populated after document worker.
5. Refund via Stage 7.
