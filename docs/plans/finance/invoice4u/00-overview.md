# Invoice4U extension — Overview (U0–U7)

> **ACTIVE (2026-07-20):** Implement Invoice4U bundled wrapper on `feat/invoice4u-provider`.  
> **Overnight:** [OVERNIGHT-AGENT.md](OVERNIGHT-AGENT.md) — mock milestone U1→U4-mock only.

Add **Invoice4U** as the **bundled IL payment + invoicing** provider (pay + tax docs). Grow/iCount adapters stay in code as fallbacks.

**Read before any stage:** this file → [PLAN-READINESS.md](PLAN-READINESS.md) → [GAP-ANALYSIS.md](GAP-ANALYSIS.md) → [SPIKE-ADR.md](SPIKE-ADR.md) → [API-REFERENCE.md](API-REFERENCE.md) → active `stage-uN-*.md` → `.instructions.md`.

**Agent prompts:** [AGENT-RUNBOOK.md](AGENT-RUNBOOK.md)

---

## Decision summary

| Item | Choice |
|------|--------|
| Slug | `invoice4u` / `invoice4u` |
| Auth | Org API key GUID + clearing company type |
| Checkout | Hosted `ProcessApiRequestV2` + `AddTokenAndCharge` + `IsDocCreate` |
| Callback | One `CallBackUrl` → payment + sale document |
| Renewals | App `run-monthly-billing` + `ChargeWithToken` (not standing orders) |
| Refunds | Clearing `Refund` + auto credit when possible |
| Signup | Manual credentials only (no silent merchant) |
| Make.com | Out of scope |

Gap analysis verdict: **API complete for V1** — see [GAP-ANALYSIS.md](GAP-ANALYSIS.md).

---

## Stage map

```text
DOCS / MOCK (no QA account required)
  U0-doc → U1 → U3 → U2a → U4-mock

QA ACCOUNT (register + Meshulam/UPAY test terminal)
  U0-live → U2b → U4-live → U5 → U6 → U7
```

| Stage | Focus | Account? | Doc |
|-------|-------|----------|-----|
| **U0-doc** | Gap + SPIKE-ADR + API ref (this folder) | No | ✅ This overview |
| **U1** | Registry, mock, credential RPC | No | [stage-u1-registry.md](stage-u1-registry.md) |
| **U3** | Settings UI + routing + checkout shell | No | [stage-u3-frontend.md](stage-u3-frontend.md) |
| **U2a** | Mock backend: callback parser + bundled doc apply | No | [stage-u2-backend.md](stage-u2-backend.md) |
| **U4-mock** | Mock renewals + refunds + isolation tests | No | [stage-u4-mock-parity.md](stage-u4-mock-parity.md) |
| **U0-live** | QA smoke + ADR open questions | **Yes** | [stage-u0-live-spike.md](stage-u0-live-spike.md) |
| **U2b** | Live HTTP client + verify + callback | Yes | [stage-u2-backend.md](stage-u2-backend.md) § U2b |
| **U4-live** | Live token renewals + refunds | Yes | [stage-u4-live.md](stage-u4-live.md) |
| **U5** | Tenant flip / seed default (product gate) | Yes | [stage-u5-defaults.md](stage-u5-defaults.md) |
| **U6** | Runbook + monitoring + Grow dormancy UI | Yes | [stage-u6-runbook.md](stage-u6-runbook.md) |
| **U7** | Production readiness checklist | Yes | [stage-u7-production.md](stage-u7-production.md) |

**Order note:** U1 → U3 and U2a can run after U1 (U3 ‖ U2a). Do not start U0-live until mock milestone is green **and** QA credentials exist.

---

## Mirror Grow / iCount patterns

Implement against the **canonical** spine only:

- `PaymentProvider` in `_shared/payments/types.ts`
- `InvoicingProvider` stub in `_shared/invoicing/types.ts` (bundled: `issueDocument` throws)
- Factories in `payments/index.ts` / `invoicing/index.ts`
- **Do not** use dormant `IPaymentProvider` under `payments/providers/types.ts`

Reference adapters: `grow.ts`, `mock-grow.ts`, `icount.ts`, `mock-icount.ts`.

---

## Hard rules

- Schema frozen — **RPC-only** credential changes (no new tables).
- No vendor names in shared orchestration — adapter folders only.
- Single success path: `finalisePayment` only activates engagements.
- Webhook replay: same `provider_payment_ref` → skip INSERT, always idempotent finalise.
- `INVOICE4U_MOCK` in CI/dev; no live QA charges unless stage says so.
- One stage per agent session; stop at DoD; do not commit unless user asks.
- VAT: charge **gross**; tax breakdown on Invoice4U documents.

---

## Plan audits

| Pass | Result |
|------|--------|
| 1st (vs Grow code) | Fixed false pending-row / PaymentId gaps |
| 2nd (industry bar) | Locked D5 pending intent, D12 PaymentId, D15–D20 auth/amount/PDF/failure — see [PLAN-READINESS.md](PLAN-READINESS.md) |

**Not claiming production 100%** until U0-live fixtures + U7. **Claiming implementation-ready for U1.**

## Mock-phase milestone

- [x] U0-doc + ADR locks (D1–D20)
- [x] Readiness note written
- [ ] U1 DoD
- [ ] U3 DoD
- [ ] U2a DoD
- [ ] U4-mock DoD
- [ ] Grow + iCount regression still green with `GROW_MOCK` + `ICOUNT_MOCK` + `INVOICE4U_MOCK`

**Next after mock:** procure QA → U0-live → live stages → U5 tenant flip.

---

## Ops prerequisites (before U0-live)

1. Register: https://privateqa.invoice4u.co.il/pages/Register.aspx  
2. Email Invoice4U: registration email + request API access + **Meshulam or UPAY** test terminal.  
3. Confirm tokenization enabled on terminal (error 309 otherwise).  
4. Set `INVOICE4U_NOTIFY_URL` to public HTTPS → payment webhook.

---

## Files an implementer will touch (summary)

See each stage. Core areas:

- `supabase/functions/_shared/payments/` (+ `invoice4u/` helpers)
- `supabase/functions/_shared/invoicing/providers/invoice4u.ts`
- `handle-payment-event`, `verify-invoice4u-credentials`, `confirm-mock-payment`
- Migration: `save_tenant_invoice4u_credentials`
- `apps/web` bundled settings + `tenantProviderRouting`
- Tests under `apps/web/src/__tests__/` / existing finance test layout
