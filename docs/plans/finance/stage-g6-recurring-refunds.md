# Stage G6 — Grow recurring billing and refund UI polish

**Goal:** Monthly renewals and refunds work for Grow tenants.

## Scope IN

- `run-monthly-billing/index.ts`: for `payment_provider=grow`, use
  `createTransactionWithToken` with the saved token from `payment_method_tokens`.
- Grow `GrowPaymentProvider.saveCard` + `billing_accounts` token storage (align with the
  existing schema in `20260608001600_finance.sql`).
- `process-refund/index.ts`: Grow refund path + `stopDirectDebit` when cancelling recurring.
- Refund modal (G1): show Grow-specific constraints (same-day full refund only — surface the
  API error message).
- Tests for renewal idempotency keys with the Grow provider.

## Scope OUT

Settings consolidation (G7).

## Tests

- `grow-renewal-charge.test.ts` — token charge metadata includes `billing_schedule_id`.
- `grow-refund.test.ts` — `refundCharge` invoked with the correct transactionId.

## DoD checklist

- [ ] Mock Grow renewal path in CI
- [ ] Seed engagement 1004 (recurring) can be tested via walkthrough + manual cron invoke
- [ ] Refund modal shows provider errors clearly

## Stop condition

Report the DoD checklist and stop. Do not start Stage G7.
