# Stage G1 — Admin finance UI and canonical offline path

**Goal:** Admin cash/bank and refunds use the same backend spine as card payments.

## Scope IN

- Refactor `AdminEnrolmentService.recordOfflinePayment`
  (`apps/web/src/features/enrolment/lib/adminEnrolmentService.ts`) to invoke the
  `record-payment` edge function (remove the direct `payments` insert).
- Map offline methods to `cash` | `bank_transfer` only (drop `check`, or map to `other`
  only if the product requires it — prefer cash/bank).
- Wire `RecordPaymentModal`
  (`apps/web/src/features/finance/components/RecordPaymentModal.tsx`) into the **admin-only**
  `StudentSlideOver.tsx` when engagement `status === 'pending_payment'` (not the parent
  portal).
- New `RefundPaymentModal.tsx`
  (`apps/web/src/features/finance/components/RefundPaymentModal.tsx`): calls `process-refund`;
  wire from the **admin** `StudentSlideOver.tsx` payment-history section (seed payment `1101`
  on Ruti).
- i18n keys under `finance.*` in `apps/web/src/i18n/en.json` and `he.json`.

## Scope OUT

Grow adapters, walkthrough page.

## Tests

- `apps/web/src/__tests__/admin-offline-payment.test.ts` — asserts the service calls
  `record-payment`, not a direct insert.
- `apps/web/src/__tests__/record-payment-finalise.test.ts` — documents expected finalise side
  effects (mocked supabase).
- Component smoke test for modals (render + submit disabled states).

## DoD checklist

- [ ] Admin offline enrolment creates a payment with `provider=manual`,
      `charge_type=initial`, `billing_account_id`
- [ ] Document queue row enqueued after offline pay
- [ ] RecordPaymentModal reachable from admin UI
- [ ] Refund modal processes seed payment Ruti (`1101`) → credit-note queue row
- [ ] i18n complete he + en

## Stop condition

Report the DoD checklist and stop. Do not start Stage G2.
