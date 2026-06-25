# Stage G0 — Test harness and pipeline fixes

**Goal:** Mock checkout behaves like a real payment form; documents and tenant config work
in dev without silent failures.

## Scope IN

- **Defer mock finalisation:** remove `applyMockSyncEvent` from
  `supabase/functions/create-checkout/index.ts`. Mock checkout returns `mockPending: true`
  (not `mockCompleted`) until the user confirms.
- **New edge function `confirm-mock-payment`:** same auth matrix as create-checkout (session
  user OR valid enrolment token); body `{ engagement_id, offering_id, scenario?:
  'success' | 'decline' }`; idempotent on duplicate `provider_payment_ref`; calls
  `handlePaymentEventInternal` on success only.
- **`MockPaymentProvider`:** scenario support; decline returns HTTP 402 with a stable error
  code and writes no payment row.
- **`enqueue-document.ts`:** structured log when `ISSUE_DOCUMENT_URL` is unset; when
  `SYNC_ISSUE_DOCUMENT_IN_DEV=true`, import and call `processQueueRow` directly (no HTTP
  self-call — avoids auth/cold-start loops).
- **New migration** `supabase/migrations/20260617000200_g0_tenant_provider_slugs.sql`:
  extend `get_tenant_config_by_subdomain` to return `payment_provider`,
  `invoicing_provider`. Regenerate types (`pnpm db:types:all`). Update
  `apps/web/src/hooks/useTenant.ts` and `apps/web/src/types/auth.ts` (`TenantConfig`).
- **Stripe settings cleanup:** remove or redirect the broken `StripeSettingsPage` →
  `PaymentSettingsPage`; update `apps/web/src/router.tsx`.
- **`EnrolmentPaymentForm.tsx`:** mock path calls `confirm-mock-payment` on submit; `onPaid()`
  only after a success response (engagement no longer `pending_payment`).
- Register `confirm-mock-payment` in `supabase/config.toml`.

## Scope OUT

Walkthrough page (G2), Grow adapters (G3+), admin offline fix (G1).

## Files

| File | Change |
|------|--------|
| `supabase/functions/create-checkout/index.ts` | Remove mock sync finalise; return `mockPending` |
| `supabase/functions/confirm-mock-payment/index.ts` | NEW — confirm on submit |
| `supabase/functions/_shared/payments/providers/mock.ts` | Scenario support, decline code |
| `supabase/functions/_shared/enqueue-document.ts` | Structured log + sync dev path |
| `supabase/functions/_shared/checkout-session.ts` | NEW — shared auth/pricing/metadata |
| `supabase/migrations/20260617000200_g0_tenant_provider_slugs.sql` | NEW — RPC slug columns |
| `apps/web/src/hooks/useTenant.ts` | Read provider slugs from RPC |
| `apps/web/src/features/enrolment/components/EnrolmentPaymentForm.tsx` | Confirm on submit |
| `apps/web/src/pages/StripeSettingsPage.tsx` | Redirect to payments settings |
| `supabase/config.toml` | Register confirm-mock-payment |

## Tests (required)

- `apps/web/src/__tests__/mock-payment-deferred.test.ts` — create-checkout does NOT finalise;
  confirm-mock-payment does.
- `apps/web/src/__tests__/mock-payment-decline.test.ts` — decline scenario leaves engagement
  `pending_payment`, no payment row.
- Update `apps/web/src/__tests__/mock-payment-confirmation.test.ts` for the new flow.
- `pnpm -C apps/web test` passes.

## DoD checklist

- [ ] Mock pay fires only on form submit
- [ ] Decline scenario shows error, no payment row
- [ ] Success scenario creates payment + enqueues document
- [ ] `useTenant` shows `mock` after finance seed
- [ ] Legacy Stripe settings route fixed/removed
- [ ] All new tests green

## Manual gates

- After the migration: ask the user to run `pnpm db:sync`, then `pnpm db:types:all`.
- `pnpm seed:dev -- --finance` → parent enrolment offering 311 → pay → engagement active;
  `document_queue` row exists; invoke `issue-document` manually if env not set.

## Stop condition

Report the DoD checklist and stop. Do not start Stage G1.
