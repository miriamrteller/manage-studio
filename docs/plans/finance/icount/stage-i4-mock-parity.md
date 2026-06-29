# Stage I4-mock-parity — iCount mock matches true API surfaces

**Status:** Ready to implement  
**Prerequisite:** I1, I2a, I3 complete; I4 isolation tests exist  
**Blocks:** I4-live (after I0-live); does **not** require iCount sandbox account  
**Related:** [stage-i4-parity.md](stage-i4-parity.md), [SPIKE-ADR.md](SPIKE-ADR.md), [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md)

---

## Problem

Mock iCount borrowed Grow shortcuts:

| Surface | Real iCount | Mock today |
|---------|-------------|------------|
| Enrolment (#2) | CC page redirect → IPN POST | Redirect ✓; `confirm-mock-payment` injects canonical `PaymentEvent` directly |
| Renewal (#3) | API v3 `cc/bill` (provisional) → IPN | `createCharge({ savedToken })` → `emitSyncEvent` |
| Webhook (#6) | URL-encoded IPN fields | Parses JSON `PaymentEvent` |
| Refund (#4) | `doc/create` form POST | Instant fake ref string |

---

## Decision — mock renewal finalisation in cron

**Chosen:** After mock `cc/bill` succeeds, **deliver IPN inline inside `processBillingSchedule` when `ICOUNT_MOCK=true`**.

- Still exercises `constructEvent` → `handlePaymentEventInternal` (IPN parser path).
- Live cron stays async-only (`pendingWebhook`; real IPN edge fn finalises).
- No separate `confirm-mock-icount-ipn` edge function for V1 mock.

Grow mock alignment (pendingWebhook + mock notify delivery) is **recommended in the same PR** but may ship as a follow-up if scope is tight.

---

## Target architecture

Two surfaces per SPIKE-ADR catalog:

```
#2 Enrolment (help center)
  createCharge → pageUrl → confirm-mock-payment → IPN body → constructEvent → handlePaymentEventInternal

#3 Renewal (API v3)
  chargeWithToken → mock POST cc/bill → pendingWebhook → deliverMockIcountIpn (ICOUNT_MOCK only) → constructEvent → handlePaymentEventInternal
```

**Rules:**

- `MockIcount.createCharge` **never** handles renewals (remove `savedToken` branch).
- Renewals use **`chargeWithToken`** only.
- **`emitSyncEvent`** removed from MockIcount.
- Live `IcountPaymentProvider.chargeWithToken` throws until I0-live / I4-live.

**Provisional renewal API:** mock `cc/bill` until I0-live capture; swap fixture if sandbox prefers `hk/charge`.

---

## Fixtures (provisional until I0-live)

Add under `docs/plans/finance/icount/fixtures/`:

| File | Purpose |
|------|---------|
| `icount-ipn-enrolment-mock.json` | IPN after CC page payment |
| `icount-ipn-renewal-mock.json` | IPN after cc/bill |
| `icount-cc-bill-request-mock.json` | Form fields for `cc/bill` |
| `icount-cc-bill-response-mock.json` | JSON success/error shape |
| `icount-refund-request-mock.json` | `doc/create` refund shape |

Each file must include `_comment`: provisional until I0-live sandbox capture.

---

## Implementation

### New modules

| Module | Responsibility |
|--------|----------------|
| `supabase/functions/_shared/payments/icount/ipn.ts` | `parseIcountIpn` → canonical `PaymentEvent`; reject Grow bodies |
| `supabase/functions/_shared/payments/icount/mock-api.ts` | Mock API v3 base URL, `buildMockCcBillRequest`, `buildMockIpnFromCharge`, `deliverMockIcountIpn` |

### Provider changes

| File | Change |
|------|--------|
| `types.ts` | Optional `chargeWithToken?(params): Promise<ChargeResult>` |
| `mock-icount.ts` | Split enrolment/renewal; IPN `constructEvent`; mock refund via doc/create shape |
| `icount.ts` | `chargeWithToken` throws pending I0-live; `createCharge` unchanged |
| `renewal-billing.ts` | Grow: `createCharge` + `savedToken`; iCount: `chargeWithToken`; mock IPN delivery when `ICOUNT_MOCK` |
| `mock.ts` | iCount confirm path: IPN → `constructEvent`; `saveMockCardToken` uses `providerSlug` not `"mock"` |

### Tests (TDD first)

| File | Cases |
|------|-------|
| `icount-ipn-parse.test.ts` | Official fields → event; Grow rejected |
| `icount-mock-cc-bill.test.ts` | Request/response shape |
| `icount-mock-renewal-flow.test.ts` | chargeWithToken → IPN → payment |
| `provider-isolation-renewal-refund.test.ts` | I4-T2: no `applyMockSyncEvent` for icount; use `chargeWithToken` |
| `icount-registry.test.ts` | createCharge ignores savedToken; chargeWithToken returns pendingWebhook |

New isolation rows (PROVIDER-ISOLATION-TDD):

- **I4-T6:** iCount renewal never calls `createCharge` with token
- **I4-T7:** iCount enrolment never calls `chargeWithToken`
- **I4-T8:** `constructEvent` rejects JSON PaymentEvent blob for icount

---

## Out of scope

- Live iCount HTTP (`I0-live`, `I2b`, `I4-live`)
- Outcome B (disable iCount auto-renewal) — if I0-live picks B, remove `icount` from `RENEWAL_TOKEN_PROVIDERS`
- `hk/charge` standing-order model until sandbox confirms

---

## DoD

- [ ] No `emitSyncEvent` on MockIcount
- [ ] Enrolment and renewal finalise via `constructEvent(IPN)`
- [ ] `createCharge` and `chargeWithToken` are separate paths
- [ ] I4-T1…T8 green with `GROW_MOCK` + `ICOUNT_MOCK`
- [ ] `pnpm -C apps/web test` green (Grow regression)

---

## Agent prompt

```
Implement I4-mock-parity per docs/plans/finance/icount/stage-i4-mock-parity.md.

Read first:
@docs/plans/finance/icount/stage-i4-mock-parity.md
@docs/plans/finance/icount/SPIKE-ADR.md
@docs/plans/finance/icount/API-V3-REFERENCE.md
@docs/plans/finance/icount/PROVIDER-ISOLATION-TDD.md
@supabase/functions/_shared/payments/providers/mock-icount.ts
@supabase/functions/_shared/payments/renewal-billing.ts
@apps/web/src/__tests__/fixtures/icount-ipn-official-fields.json

TDD first, then implement:
1. Provisional fixtures under docs/plans/finance/icount/fixtures/
2. icount/ipn.ts + parseIcountIpn
3. icount/mock-api.ts (cc/bill + buildMockIpn + deliverMockIcountIpn)
4. Remove savedToken from MockIcount.createCharge; add chargeWithToken (pendingWebhook only)
5. MockIcount.constructEvent parses IPN form body, not JSON PaymentEvent
6. renewal-billing: grow createCharge+savedToken; icount chargeWithToken; ICOUNT_MOCK delivers IPN inline after cc/bill
7. confirmMockPayment for icount: IPN → constructEvent → handlePaymentEventInternal
8. saveMockCardToken uses providerSlug (icount/grow), not "mock"
9. Update provider-isolation-renewal-refund + icount-registry tests; add I4-T6…T8

Do not implement live Icount HTTP. Run targeted tests then pnpm -C apps/web test.
Do not commit unless asked.
```
