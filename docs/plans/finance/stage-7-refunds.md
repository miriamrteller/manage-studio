# Stage 7 — Refunds → Credit Note

> **Depends on:** Stage 3 (`refundCharge`, `finalise-payment` pattern), Stage 2.
> **Outcome:** Flow E — admin refund + credit note via invoicing provider.

## Refund amount SSOT

- **Remaining refundable:** `original.total_amount_minor - COALESCE(original.refund_amount_minor, 0)`
  (partial refunds accumulate on original row).
- **P&L:** negative `charge_type='refund'` row (CHECK: `total_amount_minor <= 0`).
- **Legal doc:** `external_document_number` on refund payment row after worker runs.

## `process-refund` Edge Function

Admin-only. Input: `{ payment_id, amount_minor?, reason? }`

1. Verify admin; payment `succeeded` or `partially_refunded`; compute remaining.
2. If `provider !== 'manual'`: `getPaymentProvider(tenant).refundCharge(...)`.
3. Update original: `refunded` / `partially_refunded`, increment `refund_amount_minor`, `approved_by`.
4. Insert negative refund payment row; `refunds_payment_id` → original; `billing_account_id` copied.
5. `audit_log`.
6. `enqueueDocument({ documentKind: 'refund', paymentId: refundRow.id })` — worker loads
   `originalExternalDocumentId` from original's `external_document_id` via `buildCanonicalDocumentInput`.

## Frontend

Admin payment detail → "Issue refund" modal.

## Definition of Done

- [ ] Full/partial refund; manual skips payment provider; credit note enqueued + issued.
- [ ] Double-refund and over-refund rejected.
- [ ] Committed; `main` green.

## Test cases

1. Full refund (mock).
2. Partial + over-refund guard.
3. Manual payment refund.
4. Already fully refunded rejected.
5. Credit note references original external document.
