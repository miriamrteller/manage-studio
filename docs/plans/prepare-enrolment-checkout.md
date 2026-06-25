# prepare-enrolment-checkout — implementation plan

**Goal:** One server-owned checkout bootstrap call replaces client REST chains + separate `get-enrolment-completion` / `create-checkout` round trips.

**Success criteria:**

| Route | After |
|-------|-------|
| `/enrol/pay/:id?t=…` (waiver signed) | 1× `prepare-enrolment-checkout` |
| `/enrol/pay/:id` authenticated (waiver signed) | 1× `prepare-enrolment-checkout` |
| Stepper checkout (signed-in) | 1× `prepare-enrolment-checkout` |
| Waiver required first | 1× `load` + sign waiver + 1× `pay` |
| Mock pay submit | unchanged `confirm-mock-payment` |
| Grow polling | unchanged `get-payment-status` |

---

## Architecture (locked)

1. New edge function: `prepare-enrolment-checkout`
2. Shared logic in `supabase/functions/_shared/`
3. Keep `create-checkout` + `get-enrolment-completion` as thin wrappers (backward compat)
4. Guest stepper redirect via `create-enrolment-intake` unchanged
5. Do not link auth↔person at checkout (`apps/web/src/__tests__/enrolment-linking.test.ts`)

---

## Request / response contract

### Request (`PrepareEnrolmentCheckoutBody`)

```typescript
type CheckoutBootstrapPhase = "load" | "pay";

// existing_engagement — pay link + stepper after engagement exists
{
  phase: CheckoutBootstrapPhase;
  mode: "existing_engagement";
  engagement_id: string;
  offering_id?: string; // required for phase=pay; optional for phase=load (server reads from engagement)
  enrolment_token?: string;
}

// create_engagement — signed-in stepper only (Bearer required)
{
  phase: "pay";
  mode: "create_engagement";
  person_id: string;
  offering_id: string;
  season_id: string;
  waiver_evidence_id?: string;
  age_override_confirmed?: boolean;
  age_override_reason?: string | null;
}
```

Auth: `Authorization: Bearer …` OR `Authorization: WaiverToken …` (same as `create-checkout`).

### Response (`PrepareEnrolmentCheckoutResponse`)

```typescript
{
  context: EnrolmentCompletionContext; // superset of get-enrolment-completion
  charge: CheckoutChargePayload | null; // superset of create-checkout; null when blocked
  blockReason?: "waiver_required" | "not_payable" | "already_complete" | "pending_waiver";
}
```

---

## Patched requirements (must not skip)

### 1. Waiver gate parity

Port **`resolveEnrolmentWaiverGate`** logic from `apps/web/src/features/enrolment/lib/checkEngagementWaiver.ts` to `supabase/functions/_shared/enrolment-waiver-gate.ts`.

Must include **recent signed evidence** lookup (lines 105–124), not only `engagementHasSignedWaiver`.

Token flow may continue using engagement-only check where it does today; bootstrap uses unified gate for both paths.

### 2. `pending_waiver` handling

When engagement `status === "pending_waiver"`: return `context` + `blockReason: "pending_waiver"`, `charge: null`.

Client (`AuthenticatedCompletionView`) keeps redirect via `resolvePendingEnrolmentAction` → `/enrol/complete?engagementId=…`.

### 3. `AdminEnrolStudentModal`

File: `apps/web/src/features/enrolment/components/AdminEnrolStudentModal.tsx` (step `payment`, lines 365–379).

On pay-now: call bootstrap `phase=pay`, `mode=existing_engagement`, pass `preloadedCharge` to `AdminEnrolmentPaymentStep` → `EnrolmentPaymentForm`.

### 4. `offering_id` optional on load

`phase=load` + `existing_engagement`: server reads `offering_id` from engagement row.

### 5. `createCheckoutCharge` early exit

Preserve `create-checkout/index.ts` lines 34–56 (`active` / `pending_waiver` → `mockCompleted: true`).

### 6. Deploy order

PR1: server only → deploy → PR2+: client.

---

## Additional risks (checked)

| Risk | Mitigation |
|------|------------|
| `create_engagement` bypasses RLS | `assertCanCreateEngagement` in `_shared/authorize-engagement-create.ts` |
| Auto-link waiver evidence (auth pay) | Client keeps `EnrolmentService.update` when `context.waiverAlreadySigned` + evidence not linked |
| Strict Mode double prep | Module-level inflight map in `useCheckoutPreparation` + `fetchCheckoutBootstrap` |
| Admin modal not in stepper | Explicit Phase 4.6 |
| `requireAuth=false` stepper guest | Guest still redirects to token URL; unchanged |
| Finance walkthrough | Uses `confirm-mock-payment` directly; unchanged |

---

## Phase 1 — Server (files)

### New

- `supabase/functions/_shared/checkout-bootstrap-types.ts`
- `supabase/functions/_shared/enrolment-statuses.ts`
- `supabase/functions/_shared/age-eligibility.ts`
- `supabase/functions/_shared/enrolment-waiver-gate.ts`
- `supabase/functions/_shared/enrolment-completion-context.ts`
- `supabase/functions/_shared/create-checkout-charge.ts`
- `supabase/functions/_shared/authorize-engagement-create.ts`
- `supabase/functions/_shared/resolve-or-create-engagement.ts`
- `supabase/functions/_shared/prepare-enrolment-checkout.ts` (orchestrator)
- `supabase/functions/prepare-enrolment-checkout/index.ts`

### Modify

- `supabase/config.toml` — register function
- `supabase/functions/get-enrolment-completion/index.ts` — delegate
- `supabase/functions/create-checkout/index.ts` — delegate

### Tests

- `apps/web/src/__tests__/enrolment-waiver-gate.test.ts`
- `apps/web/src/__tests__/checkout-bootstrap.test.ts`
- `apps/web/src/__tests__/prepare-enrolment-checkout.test.ts`

---

## Phase 2 — Client shared

- `apps/web/src/features/enrolment/lib/checkoutBootstrapTypes.ts`
- `apps/web/src/features/enrolment/lib/fetchCheckoutBootstrap.ts`
- `apps/web/src/features/enrolment/hooks/useCheckoutBootstrap.ts`
- `apps/web/src/features/enrolment/components/CheckoutPaymentShell.tsx`

---

## Phase 3 — Pay link views

- `TokenCompletionView.tsx` — single bootstrap; inline `CheckoutPaymentShell`
- `AuthenticatedCompletionView.tsx` — single bootstrap; waiver link effect preserved

---

## Phase 4 — Stepper + admin

- `useCheckoutPreparation.ts` — server `create_engagement`; inflight lock; return `checkoutCharge`
- `StepCheckout.tsx`, `EnrolmentStepper.tsx`
- `StepAdminCheckout.tsx`, `AdminEnrolmentPaymentStep.tsx`
- **4.6** `AdminEnrolStudentModal.tsx` — bootstrap on pay now

### Phase 5 — Cleanup

- Disable `useAccountStudents` / `usePersonExistingEnrolments` on checkout step
- Remove `fetchCheckoutIntent` when no legacy callers

---

## Regression checklist

- [ ] `pnpm -C apps/web test enrolment-waiver-gate.test.ts checkout-bootstrap.test.ts prepare-enrolment-checkout.test.ts enrolment-stepper.test.ts pendingEnrolmentAction.test.ts mock-payment-deferred.test.ts`
- [ ] Token link: 1 bootstrap when waiver signed (DevTools)
- [ ] Auth pay: recent waiver evidence skips re-sign
- [ ] `pending_waiver` redirects to `/enrol/complete`
- [ ] Admin modal pay now works
- [ ] Guest stepper still redirects to token URL
