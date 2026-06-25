# Stage G2 — Finance walkthrough and enhanced mock UX

**Goal:** A dev-only tool to step through every flow (success + error) with visible pipeline
state.

## Scope IN

- New page `FinanceWalkthroughPage.tsx` (`apps/web/src/pages/`) at
  `/admin/dev/finance-walkthrough` (gate: `import.meta.env.DEV` or
  `VITE_ENABLE_FINANCE_WALKTHROUGH=true`; admin role required).
- Sections: seeded scenario links (from `supabase/seed-finance.sql` matrix), pipeline panel
  (engagement status, payment row, queue status, `external_document_*`, last `audit_log`
  email action).
- Buttons: trigger `issue-document` for a payment_id; simulate mock decline/success.
- Enhanced `MockPaymentShell` inside `EnrolmentPaymentForm.tsx`: show amount/VAT, test card
  numbers (success `4580458045804580`, decline `4580000000000000` per Grow simulator
  convention, reused for mock).
- Playwright: `apps/web/e2e/finance-mock-happy-path.spec.ts` — tagged `@finance-local`,
  **skipped in CI by default** (requires hosted dev + seed); run locally via
  `pnpm -C apps/web exec playwright test e2e/finance-mock-happy-path.spec.ts`.
- Update `supabase/seed-finance.sql` header with walkthrough URLs.

## Scope OUT

Grow production integration.

## Tests

- Unit test for the walkthrough pipeline query helper.
- Playwright spec passes locally with mock env vars documented (not a CI merge gate yet).

## DoD checklist

- [ ] Walkthrough lists all seed scenarios A–H with deep links
- [ ] Pipeline shows payment → queue → document fields
- [ ] Mock form displays the price breakdown
- [ ] Playwright happy path green locally
- [ ] Env setup documented in `docs/deployment/THIRD_PARTY_SERVICES.md` snippet:
      `ISSUE_DOCUMENT_URL`, `RESEND_API_KEY`

## Stop condition

Report the DoD checklist and stop. Do not start Stage G3.
