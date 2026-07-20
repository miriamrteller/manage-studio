# Invoice4U — Agent runbook (U0–U7)

Copy one prompt per session. Attach the `@` files listed. Stop at the stage DoD — do not start the next stage.

**Always read first:** `@docs/plans/finance/invoice4u/00-overview.md` `@docs/plans/finance/invoice4u/GAP-ANALYSIS.md` `@docs/plans/finance/invoice4u/SPIKE-ADR.md` `@.instructions.md`

---

## U1 — Registry + mock + credentials

```
Implement Stage U1 only, per docs/plans/finance/invoice4u/stage-u1-registry.md.

@docs/plans/finance/invoice4u/00-overview.md
@docs/plans/finance/invoice4u/SPIKE-ADR.md
@docs/plans/finance/invoice4u/stage-u1-registry.md
@docs/plans/finance/icount/stage-i1-registry.md
@.instructions.md
@supabase/functions/_shared/payments/registry.ts
@supabase/functions/_shared/payments/index.ts
@supabase/functions/_shared/invoicing/registry.ts
@supabase/functions/_shared/payments/providers/mock-grow.ts

Goal: register invoice4u, MockInvoice4uPaymentProvider, invoicing stub, save_tenant_invoice4u_credentials RPC, confirm-mock-payment path. No live HTTP. No UI.

Commands: pnpm -C apps/web test
After migration: ask user to run pnpm db:sync then pnpm db:types:all.

Stop after U1 DoD. Do not start U2/U3.
```

---

## U3 — Frontend

```
Implement Stage U3 only, per docs/plans/finance/invoice4u/stage-u3-frontend.md.

@docs/plans/finance/invoice4u/00-overview.md
@docs/plans/finance/invoice4u/stage-u3-frontend.md
@apps/web/src/lib/tenantProviderRouting.ts
@apps/web/src/features/settings/components/BundledPaymentsSettings.tsx
@apps/web/src/features/settings/components/GrowSettingsForm.tsx

Goal: Invoice4U in bundled settings (API key + clearing company), routing, mock checkout pageUrl.

Commands: pnpm -C apps/web test

Stop after U3 DoD.
```

---

## U2a — Mock backend callback

```
Implement Stage U2a only, per docs/plans/finance/invoice4u/stage-u2-backend.md (U2a section).

@docs/plans/finance/invoice4u/API-REFERENCE.md
@docs/plans/finance/invoice4u/SPIKE-ADR.md
@docs/plans/finance/invoice4u/stage-u2-backend.md
@supabase/functions/_shared/payments/providers/grow.ts
@supabase/functions/_shared/payments/handle-payment-event.ts

Goal: parse Invoice4U callback fixture, constructEvent, apply bundled document on mock success. No live HTTP.

Commands: pnpm -C apps/web test

Stop after U2a DoD. Do not start U2b.
```

---

## U4-mock — Mock renewals/refunds

```
Implement Stage U4-mock only, per docs/plans/finance/invoice4u/stage-u4-mock-parity.md.

@docs/plans/finance/invoice4u/stage-u4-mock-parity.md
@supabase/functions/_shared/payments/renewal-billing.ts
@supabase/functions/process-refund/index.ts

Goal: mock ChargeWithToken renewals + refundCharge for invoice4u; isolation tests.

Commands: pnpm -C apps/web test

Stop after U4-mock DoD. Mock milestone complete — wait for QA account before U0-live.
```

---

## U0-live — QA spike (docs/fixtures)

```
Execute Stage U0-live only, per docs/plans/finance/invoice4u/stage-u0-live-spike.md.

@docs/plans/finance/invoice4u/stage-u0-live-spike.md
@docs/plans/finance/invoice4u/SPIKE-ADR.md
@docs/plans/finance/invoice4u/API-REFERENCE.md

Goal: smoke QA with real key; capture redacted fixtures; close ADR open questions. Minimal code.

Stop after ADR sign-off. Do not implement U2b in this session unless user says so.
```

---

## U2b — Live HTTP

```
Implement Stage U2b only, per docs/plans/finance/invoice4u/stage-u2-backend.md (U2b section).

@docs/plans/finance/invoice4u/stage-u2-backend.md
@docs/plans/finance/invoice4u/SPIKE-ADR.md
@docs/plans/finance/invoice4u/API-REFERENCE.md
@supabase/functions/_shared/payments/providers/grow.ts

Goal: live ProcessApiRequestV2 createCharge + constructEvent + verify-invoice4u-credentials.

Stop after U2b DoD.
```

---

## U4-live — Live renewals/refunds

```
Implement Stage U4-live only, per docs/plans/finance/invoice4u/stage-u4-live.md.

@docs/plans/finance/invoice4u/stage-u4-live.md
@docs/plans/finance/invoice4u/SPIKE-ADR.md

Goal: live ChargeWithToken + Refund + credit handling.

Stop after U4-live DoD.
```

---

## U5 — Defaults / flip

```
Implement Stage U5 only, per docs/plans/finance/invoice4u/stage-u5-defaults.md.

Confirm with user: Option A (single tenant) vs Option B (provision default).

Stop after U5 DoD.
```

---

## U6 — Runbook

```
Implement Stage U6 only, per docs/plans/finance/invoice4u/stage-u6-runbook.md.

Write INVOICE4U-RUNBOOK.md and update THIRD_PARTY_SERVICES.md.

Stop after U6 DoD.
```

---

## U7 — Production checklist

```
Execute Stage U7 checklist only, per docs/plans/finance/invoice4u/stage-u7-production.md.

Do not flip prod secrets without explicit user confirmation.

Stop after checklist sign-off.
```
