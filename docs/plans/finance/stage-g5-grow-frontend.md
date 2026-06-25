# Stage G5 — Grow frontend checkout shell

**Goal:** Parents/admins see the Grow payment UI; completion waits for the webhook.

## Scope IN

- `GrowPaymentShell` (`apps/web/src/features/enrolment/components/GrowPaymentShell.tsx`):
  iframe or redirect from `pageUrl`; poll a lightweight `get-payment-status` edge function
  returning `{ paid: boolean, paymentId?, failureReason? }` (avoids RLS leaks). Timeout 120s
  with a retry CTA.
- New edge function `supabase/functions/get-payment-status/index.ts` (authenticated; same
  auth matrix as create-checkout).
- Update `EnrolmentPaymentForm.tsx` branching: `mock` | `grow` | `stripe`.
- `create-checkout` response type extended; frontend types updated.
- Loading/error states: payment cancelled, webhook timeout, retry.
- i18n for Grow-specific copy (en + he).

## Scope OUT

Settings UI (G7), recurring (G6).

## Tests

- Component test: renders the iframe when `pageUrl` is present.
- Integration test: mock fetch create-checkout returns a grow pageUrl; polling resolves on
  engagement active.

## DoD checklist

- [ ] A Grow tenant (sandbox) can complete the enrolment pay flow in the browser
- [ ] Mock tenant still uses the enhanced mock form (G2)
- [ ] Stripe path unchanged
- [ ] a11y: the payment step has status announcements

## Stop condition

Report the DoD checklist and stop. Do not start Stage G6.
