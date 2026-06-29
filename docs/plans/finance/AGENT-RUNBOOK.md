# Finance Grow Extension — Agent Runbook (G0–G7)

Copy-paste prompts for each stage. Generate with `pnpm finance:prompt g0` (… `g7`).
Each prompt names the files to attach, the exact commands, and a **do not start the next
stage** stop line. Run one stage per session.

---

## Stage G0 — Test harness and pipeline fixes

```
Implement Stage G0 only, per docs/plans/finance/stage-g0-test-harness.md.

@docs/plans/finance/00-overview.md
@docs/plans/finance/stage-g0-test-harness.md
@.instructions.md
@supabase/functions/create-checkout/index.ts
@supabase/functions/_shared/payments/providers/mock.ts
@supabase/functions/_shared/enqueue-document.ts
@apps/web/src/features/enrolment/components/EnrolmentPaymentForm.tsx
@apps/web/src/hooks/useTenant.ts

Goal: mock checkout behaves like a real payment form; documents and tenant config work in
dev without silent failures. Defer mock finalisation to a new confirm-mock-payment edge
function; add provider slugs to get_tenant_config_by_subdomain (new migration); fix the
broken Stripe settings route.

Commands: pnpm -C apps/web test
After the migration, ask the user to run pnpm db:sync, then pnpm db:types:all.

Stop after the G0 DoD checklist. Do not start Stage G1.
```

---

## Stage G1 — Admin finance UI and canonical offline path

```
Implement Stage G1 only, per docs/plans/finance/stage-g1-admin-finance.md.

@docs/plans/finance/00-overview.md
@docs/plans/finance/stage-g1-admin-finance.md
@.instructions.md
@apps/web/src/features/enrolment/lib/adminEnrolmentService.ts
@supabase/functions/record-payment/index.ts
@supabase/functions/process-refund/index.ts
@apps/web/src/features/finance/components/RecordPaymentModal.tsx
@apps/web/src/features/students/components/StudentSlideOver.tsx

Goal: admin cash/bank and refunds use the same backend spine as card payments
(record-payment → finalise-payment → enqueueDocument). Wire RecordPaymentModal and a new
RefundPaymentModal into the admin StudentSlideOver only.

Commands: pnpm -C apps/web test

Stop after the G1 DoD checklist. Do not start Stage G2.
```

---

## Stage G2 — Finance walkthrough and enhanced mock UX

```
Implement Stage G2 only, per docs/plans/finance/stage-g2-walkthrough.md.

@docs/plans/finance/00-overview.md
@docs/plans/finance/stage-g2-walkthrough.md
@.instructions.md
@apps/web/src/features/enrolment/components/EnrolmentPaymentForm.tsx
@supabase/seed-finance.sql

Goal: dev-only FinanceWalkthrough page to step through every flow with visible pipeline
state; enhanced mock form with price breakdown and test card numbers; a local-only
Playwright happy-path spec (skipped in CI).

Commands: pnpm -C apps/web test
Local only: pnpm -C apps/web exec playwright test e2e/finance-mock-happy-path.spec.ts

Stop after the G2 DoD checklist. Do not start Stage G3.
```

---

## Stage G3 — Grow registry, credentials, and mock Grow adapter

```
Implement Stage G3 only, per docs/plans/finance/stage-g3-grow-registry.md.

@docs/plans/finance/00-overview.md
@docs/plans/finance/stage-g3-grow-registry.md
@.instructions.md
@supabase/functions/_shared/payments/registry.ts
@supabase/functions/_shared/invoicing/registry.ts
@supabase/functions/_shared/payments/types.ts
@supabase/functions/_shared/payments/index.ts

Goal: plumb Grow into the registries and tenant config without live charges. Add a
save_tenant_grow_credentials RPC (new migration), IL provisioning defaults (grow/grow),
ChargeResult.pageUrl, stub Grow providers, and a MockGrowPaymentProvider for CI.

Commands: pnpm -C apps/web test
After the migration, ask the user to run pnpm db:sync, then pnpm db:types:all.

Stop after the G3 DoD checklist. Do not start Stage G4.
```

---

## Stage G4 — Grow payment adapter, webhooks, and bundled orchestration

```
Implement Stage G4 only, per docs/plans/finance/stage-g4-grow-backend.md.

@docs/plans/finance/00-overview.md
@docs/plans/finance/stage-g4-grow-backend.md
@.instructions.md
@supabase/functions/_shared/payments/providers/grow.ts
@supabase/functions/handle-payment-event/index.ts
@supabase/functions/create-checkout/index.ts
@supabase/functions/_shared/payments/finalise-payment.ts

Largest stage. Implement G4a (payment path + approve) first; if context limits hit, stop
after G4a and report partial DoD — do not start the frontend. Then G4b (invoice webhook +
bundled skip orchestration) once G4a tests are green.

Commands: pnpm -C apps/web test

Stop after the G4 DoD checklist. Do not start Stage G5.
```

---

## Stage G5 — Grow frontend checkout shell

```
Implement Stage G5 only, per docs/plans/finance/stage-g5-grow-frontend.md.

@docs/plans/finance/00-overview.md
@docs/plans/finance/stage-g5-grow-frontend.md
@.instructions.md
@apps/web/src/features/enrolment/components/EnrolmentPaymentForm.tsx
@supabase/functions/create-checkout/index.ts

Goal: GrowPaymentShell renders the Grow pageUrl (iframe/redirect) and polls a lightweight
get-payment-status edge function until the engagement is active. Branch EnrolmentPaymentForm
on mock | grow | stripe.

Commands: pnpm -C apps/web test

Stop after the G5 DoD checklist. Do not start Stage G6.
```

---

## Stage G6 — Grow recurring billing and refund UI polish

```
Implement Stage G6 only, per docs/plans/finance/stage-g6-recurring-refunds.md.

@docs/plans/finance/00-overview.md
@docs/plans/finance/stage-g6-recurring-refunds.md
@.instructions.md
@supabase/functions/run-monthly-billing/index.ts
@supabase/functions/process-refund/index.ts
@supabase/functions/_shared/payments/providers/grow.ts

Goal: monthly renewals via createTransactionWithToken with saved tokens; Grow refund path
with stopDirectDebit for recurring; refund modal surfaces Grow constraints.

Commands: pnpm -C apps/web test

Stop after the G6 DoD checklist. Do not start Stage G7.
```

---

## Stage G7 — Grow settings, cleanup, and production readiness

```
Implement Stage G7 only, per docs/plans/finance/stage-g7-settings-cleanup.md.

@docs/plans/finance/00-overview.md
@docs/plans/finance/stage-g7-settings-cleanup.md
@.instructions.md
@apps/web/src/features/settings/components/TenantSettingsHub.tsx
@apps/web/src/features/finance/components/FinanceHealthCard.tsx

Goal: single Grow onboarding surface (GrowSettingsForm + verify-grow-credentials), legacy
Stripe cleanup, FinanceHealthCard Grow status, and docs/plans/finance/GROW-RUNBOOK.md.

Commands: pnpm -C apps/web test

Stop after the G7 DoD checklist. Do not start Stage G8 unless the user asks for G8-research.
```

---

## Stage G8-research — Silent Grow signup (docs only)

```
Stage G8-research only — docs, no code.

@docs/plans/finance/stage-g8-silent-provisioning.md
@docs/plans/finance/GROW-API-REFERENCE.md
@docs/plans/finance/GROW-RUNBOOK.md
@docs/plans/finance/00-overview.md
@supabase/migrations/20260608002400_tenant_provisioning.sql

Deliver docs/plans/finance/G8-ADR.md per G8-research DoD in stage-g8-silent-provisioning.md:
partner/marketplace onboarding API auth model, OpalSwift→Grow field mapping,
success/failure paths (manual bundled Grow settings fallback), SHAAM manual steps,
go/no-go for G8-impl.

Do not implement edge functions. Do not block I2a/I6. Stop after research sign-off checklist.
```
