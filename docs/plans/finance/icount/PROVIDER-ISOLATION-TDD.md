# Provider isolation — Grow vs iCount (TDD)

**Goal:** A tenant on `grow/grow` must **never** execute iCount adapters, parsers, credentials, or UI — and vice versa for `icount/icount`. Both providers coexist in one codebase without cross-wiring.

**Non-negotiable:** Dispatch by `tenants.payment_provider` / `invoicing_provider` slug — **never** `country === 'IL'` alone.

**TDD rule:** Write the **failing isolation test first**, then implement. Every stage below lists tests that must exist and pass before the stage DoD is claimed.

---

## Isolation layers

| Layer | Mechanism | Verified by |
|-------|-----------|-------------|
| **Registry / factory** | `getPaymentProvider(slug)` / `getPaymentProviderForTenant(tenantId)` | I1 tests |
| **Mock factory** | `GROW_MOCK` + `ICOUNT_MOCK` both `true`; mock chosen **by slug** | I1 tests |
| **Checkout / charge** | `create-checkout` → tenant slug → one `createCharge` | I1 + I3 tests |
| **Payment webhook** | `peekTenantId` → `getPaymentProviderForTenant` → `constructEvent` | I2b tests (+ I2a peek mocks) |
| **Document webhook** | Load tenant `invoicing_provider` → dispatch parser | I2a tests |
| **Bundled skip** | Matching payment + invoicing slugs only | I3 tests |
| **Credentials** | Atomic RPC per provider; stale tokens cleared on switch | I1 + I4 tests |
| **UI** | Slug-based nav, settings, checkout shells | I3 tests |
| **Live sandbox** | Grow tenant + icount tenant smoke in same env | I0-live + I2b manual; I5 seed test |

---

## Test files (create or extend)

| File | Stage | Purpose |
|------|-------|---------|
| `apps/web/src/__tests__/icount-registry.test.ts` | I1 | Registry + factory isolation |
| `apps/web/src/__tests__/provider-isolation-mock.test.ts` | I1 | Dual mock env (`GROW_MOCK` + `ICOUNT_MOCK`) |
| `apps/web/src/__tests__/icount-credential-rpc.test.ts` | I1 | Atomic slugs; icount RPC never sets `grow` |
| `apps/web/src/__tests__/handle-invoice-event-isolation.test.ts` | I2a | Document webhook dispatch by `invoicing_provider` |
| `apps/web/src/__tests__/icount-document-webhook-parse.test.ts` | I2a | icount parser; Grow fixture rejected |
| `apps/web/src/__tests__/grow-webhook-parse.test.ts` | I2a | **Regression** — unchanged Grow behavior |
| `apps/web/src/__tests__/navigation-config.test.ts` | I3 | Extend — IL + icount ≠ Grow nav |
| `apps/web/src/__tests__/enrolment-provider-routing.test.ts` | I3 | Checkout shell by slug |
| `apps/web/src/__tests__/bundled-provider-slug.test.ts` | I3 | `tenantUsesBundledProvider` matching slugs |
| `apps/web/src/__tests__/icount-ipn-parse.test.ts` | I2b | Live IPN fixture only |
| `apps/web/src/__tests__/icount-ipn-isolation.test.ts` | I2b | IPN never parsed as Grow |
| `apps/web/src/__tests__/payment-webhook-peek-isolation.test.ts` | I2b | `peekTenantId` routes to correct adapter |
| `apps/web/src/__tests__/provider-isolation-renewal-refund.test.ts` | I4 | Billing/refund use payment row slug |
| `apps/web/src/__tests__/provider-isolation-dual-seed.test.ts` | I5 | icount default + Grow regression tenant |

Deno edge tests may mirror parse/peek logic under `supabase/functions/_shared/payments/icount/__tests__/` if preferred — web tests above are the minimum bar per finance runbook.

---

## Phase A — Mock build (no account)

### I1 — Registry, factory, confirm-mock (TDD first)

Write tests **before** adding `icount` to registries.

| # | Test case | Assert |
|---|-----------|--------|
| I1-T1 | `parsePaymentProviderSlug('icount')` | Returns `'icount'` |
| I1-T2 | `parsePaymentProviderSlug('grow')` | Returns `'grow'` |
| I1-T3 | `getPaymentProvider('grow')` with both mocks `true` | Instance of `MockGrowPaymentProvider`, **not** MockIcount |
| I1-T4 | `getPaymentProvider('icount')` with both mocks `true` | Instance of `MockIcountPaymentProvider`, **not** MockGrow |
| I1-T5 | `getPaymentProvider('stripe')` | Never returns Grow or Icount mock |
| I1-T6 | `confirm-mock-payment` tenant `payment_provider=icount`, `ICOUNT_MOCK=true` | Succeeds; `providerSlug` in event is `'icount'` |
| I1-T7 | `confirm-mock-payment` tenant `payment_provider=grow`, only `ICOUNT_MOCK=true` | **409** — not configured for mock |
| I1-T8 | `confirm-mock-payment` tenant `payment_provider=icount`, only `GROW_MOCK=true` | **409** |
| I1-T9 | `save_tenant_icount_credentials` | Sets `payment_provider` **and** `invoicing_provider` to `'icount'` atomically |
| I1-T10 | Grow credential RPC unchanged | Still sets `grow/grow`; never `'icount'` |

### I2a — Document webhook dispatch (TDD first)

Write tests **before** generalizing `handle-invoice-event`.

| # | Test case | Assert |
|---|-----------|--------|
| I2a-T1 | Post Grow invoice notify fixture to handler; tenant `invoicing_provider=grow` | `applyGrowInvoiceNotify` path; payment updated |
| I2a-T2 | Post icount document webhook fixture; tenant `invoicing_provider=icount` | icount parser path; **Grow parser not invoked** |
| I2a-T3 | Post icount fixture; tenant `invoicing_provider=grow` | **409 or 400** — wrong provider / payment not found |
| I2a-T4 | Post Grow fixture; tenant `invoicing_provider=icount` | **409 or 400** — no Grow fields written to icount tenant payment |
| I2a-T5 | Grow `grow-webhook-parse.test.ts` | Full suite still green (regression) |

### I3 — UI routing (TDD first)

| # | Test case | Assert |
|---|-----------|--------|
| I3-T1 | Tenant `{ country: 'IL', payment_provider: 'icount' }` | **Not** `tenantUsesGrow()`; icount setup nav visible |
| I3-T2 | Tenant `{ payment_provider: 'grow' }` | Grow setup nav; **no** icount-only routes |
| I3-T3 | `EnrolmentPaymentForm` icount + `pageUrl` | Hosted checkout ready; **not** blocked by `growReady` |
| I3-T4 | `EnrolmentPaymentForm` grow + `pageUrl` | Grow shell; icount shell **not** mounted |
| I3-T5 | `tenantUsesBundledProvider({ payment: 'icount', invoicing: 'grow' })` | **false** — mismatched slugs |
| I3-T6 | `FinanceHealthCard` `provider=icount` | Calls verify-icount path, **not** verify-grow |

---

## Phase B — Live integration (account required)

Run after [I0-live](stage-i0-live-spike.md): `icount-ipn-notify.json` committed.

### Post-account TDD workflow (order matters)

Do **not** implement live IPN parsers or flip defaults until this sequence completes:

```text
1. Sandbox capture     → commit icount-ipn-notify.json (redacted)
2. LIVE-T1 … LIVE-T4   → fixture contract + mutual parser rejection (red → green)
3. SPIKE-ADR sign-off  → catalog rows #1, #3, #4, #6 updated; deferrals documented
4. I2b-T1 … I2b-T6     → write failing tests, then IcountPaymentProvider.constructEvent + peek
5. Manual smoke        → one CC page payment → IPN → finalise (RUNBOOK)
6. I4-T1 … I4-T5       → billing/refund by payment-row slug (or signed deferral)
7. Pre-I5 gate         → all mock + live isolation rows green
8. I5-T1 … I5-T3       → dual seed; then provision_tenant + seed flip
```

**Rule:** Every Phase B stage starts with its TDD table row(s) **failing**, then implementation, then `pnpm -C apps/web test` with **both** `GROW_MOCK=true` and `ICOUNT_MOCK=true`.

**Grow regression:** LIVE-T3/T4 and I2b-T3/T4 explicitly prove Grow notify bodies never parse as icount and vice versa — same isolation bar as mock phase.

### I0-live — Fixture contract tests (TDD before I2b parser)

| # | Test case | Assert |
|---|-----------|--------|
| LIVE-T1 | `icount-ipn-notify.json` exists | Redacted sandbox capture; not hand-authored |
| LIVE-T2 | Parser skeleton on live fixture | Required keys from capture parse without throw |
| LIVE-T3 | Grow `grow-payment-notify.json` passed to **icount** IPN parser | **Fails** parse (no silent success) |
| LIVE-T4 | icount IPN fixture passed to **Grow** `parseGrowNotify` | **Fails** parse (no silent success) |

### I2b — Live payment webhook (TDD first)

| # | Test case | Assert |
|---|-----------|--------|
| I2b-T1 | `handle-payment-event` body = live IPN; tenant `payment_provider=icount` | `IcountPaymentProvider.constructEvent` (or icount parse); slug `'icount'` on finalise |
| I2b-T2 | Same IPN body; tenant `payment_provider=grow` | **400** or wrong-provider error — **no** icount finalise |
| I2b-T3 | Grow payment notify; tenant `payment_provider=grow` | Grow path unchanged |
| I2b-T4 | Grow payment notify; tenant `payment_provider=icount` | **400** — Grow parser not applied |
| I2b-T5 | `peekTenantId` on IPN with `tenant_id` custom field | Resolves icount tenant; then factory returns icount adapter |
| I2b-T6 | `verify-icount-credentials` | Only callable for icount slug tenant |

### I4 — Renewals, refunds (TDD; live API optional)

| # | Test case | Assert |
|---|-----------|--------|
| I4-T1 | `run-monthly-billing` schedule on grow tenant | `GrowPaymentProvider` / grow branch only |
| I4-T2 | Schedule on icount tenant (mock or live) | Icount adapter only; **no** Grow HTTP |
| I4-T3 | Refund payment row `provider=grow` | Grow `refundCharge` |
| I4-T4 | Refund payment row `provider=icount` | Icount `refundCharge` (or documented manual deferral) |
| I4-T5 | Switch credentials grow → icount via RPC | Stale grow tokens removed; icount tokens isolated |

### I5 — Dual seed (TDD before default flip)

| # | Test case | Assert |
|---|-----------|--------|
| I5-T1 | Primary seed tenant `icount/icount` + `ICOUNT_MOCK` | Mock enrolment uses MockIcount |
| I5-T2 | Grow regression block uncommented + `GROW_MOCK` | Grow enrolment uses MockGrow |
| I5-T3 | Same CI run with both mocks `true` | I1-T3 + I1-T4 still pass (no cross-wiring) |

---

## CI policy

Every icount stage PR must run:

```bash
pnpm -C apps/web test
```

With **both** `GROW_MOCK=true` and `ICOUNT_MOCK=true` in test env where dual-tenant tests apply (see `provider-isolation-mock.test.ts`).

Grow-only tests (`grow-registry`, `grow-webhook-parse`, `grow-renewal-charge`, etc.) must stay green — **Grow regression is part of isolation**.

---

## Forbidden patterns (code review checklist)

- [ ] `country === 'IL'` to choose payment/invoicing provider
- [ ] `parseGrowNotify` / `parseGrowInvoiceNotify` on icount webhook bodies without dispatch
- [ ] Global single mock flag that returns one provider for all tenants
- [ ] Hardcoded `grow` in `run-monthly-billing`, refund, or invoice handlers without slug check
- [ ] `payment_provider !== invoicing_provider` for bundled tenants (except explicit non-bundled config)

---

## Stage DoD cross-reference

| Stage | Isolation tests required |
|-------|-------------------------|
| I1 | I1-T1 … I1-T10 |
| I2a | I2a-T1 … I2a-T5 |
| I3 | I3-T1 … I3-T6 |
| I0-live | LIVE-T1 … LIVE-T4 |
| I2b | I2b-T1 … I2b-T6 |
| I4 | I4-T1 … I4-T5 |
| I5 | I5-T1 … I5-T3 |

Epic complete only when **all rows** pass plus Pre-I5 gate.
