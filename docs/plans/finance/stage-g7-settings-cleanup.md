# Stage G7 — Grow settings, cleanup, and production readiness

**Goal:** A single Grow onboarding surface; legacy cleanup; full verification checklist.

## Scope IN

- New `GrowSettingsForm.tsx`
  (`apps/web/src/features/settings/components/GrowSettingsForm.tsx`) + page (or replace the
  Payment + Invoicing forms when bundled).
- `TenantSettingsHub.tsx`: one "Payments & invoices (Grow)" card for IL.
- `verify-grow-credentials` edge function (an auth health ping to the Grow sandbox).
- Remove the dead Stripe route; migrate copy from `StripeSettingsForm`.
- `FinanceHealthCard` (`apps/web/src/features/finance/components/FinanceHealthCard.tsx`):
  show Grow auth status.
- Final runbook `docs/plans/finance/GROW-RUNBOOK.md`: sandbox setup, SHAAM / Israel Invoice
  connection, env vars, webhook URLs, pg_cron for `issue-document`.
- Full Playwright suite: mock happy path + optional Grow sandbox tag (`@grow-sandbox`,
  skipped in CI).

## Scope OUT

US Stripe default changes (keep Stripe for `country='US'`).

## Tests

- Settings form render + validation tests.
- `verify-grow-credentials` unit test (mocked fetch).

## DoD checklist

- [ ] A new IL tenant provisions as grow/grow
- [ ] Admin can save Grow creds and test the connection
- [ ] Finance walkthrough + seed matrix all green
- [ ] GROW-RUNBOOK complete
- [ ] No references to `save_tenant_stripe_credentials` in active code

## Stop condition

Report the DoD checklist and stop. This is the final stage.
