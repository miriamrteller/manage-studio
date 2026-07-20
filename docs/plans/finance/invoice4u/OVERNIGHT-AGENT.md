# Invoice4U — Overnight agent brief (ACTIVE)

**Product:** Implement Invoice4U bundled pay + invoicing wrapper (replaces Grow as IL target for this branch).  
**Not in scope:** finishing iCount live, Grow polish, Make.com.

**Branch:** `feat/invoice4u-provider` (create if missing; never push to `main`).

---

## Run mode

One continuous session through the **mock milestone** (no QA account required):

```text
U1 → U3 → U2a → U4-mock
```

Then **STOP**. Do **not** start U0-live / U2b / U4-live / U5–U7 without QA credentials and explicit user go-ahead.

Commit **once per stage** on this branch (message: `feat(invoice4u): stage UN — …`). Do not push unless the user asks.

---

## Required reading (in order)

1. `.instructions.md`
2. `docs/plans/finance/invoice4u/00-overview.md`
3. `docs/plans/finance/invoice4u/PLAN-READINESS.md`
4. `docs/plans/finance/invoice4u/GAP-ANALYSIS.md`
5. `docs/plans/finance/invoice4u/SPIKE-ADR.md` — **D1–D20 are LOCKED**
6. `docs/plans/finance/invoice4u/API-REFERENCE.md`
7. Active stage file before each stage
8. Mirror: Grow/iCount adapters (`mock-grow.ts`, `grow.ts`, icount I1/I3 patterns)

---

## Locked decisions (do not reopen)

| ID | Decision |
|----|----------|
| D1 | Slug `invoice4u` / `invoice4u` |
| D2 | App renewals via `ChargeWithToken` — **no** standing orders |
| D3 | Sale docs from payment callback after finalise |
| D4 | API key → `secret_enc`; clearing company → `public_key` |
| D5 | **Pending `payments` row** at hosted `createCharge` |
| D12 | On success, `provider_payment_ref` := Invoice4U `PaymentId` |
| D13 | Stub `verify-invoice4u-credentials` in U1 |
| D14 | `renewal-billing` explicit `invoice4u` → `chargeWithToken` |
| D15–D19 | Metadata from pending row; amount verify; fail path; PDF URL field |
| D20 | Cash/offline tax docs out of this mock milestone |

Canonical interfaces only: `_shared/payments/types.ts` + `_shared/invoicing/types.ts`.  
**Do not** use dormant `IPaymentProvider` under `payments/providers/types.ts`.

---

## Stage checklist

### U1 — [stage-u1-registry.md](stage-u1-registry.md)

- [ ] Registry slugs + factories + `INVOICE4U_MOCK`
- [ ] Mock + stub payment/invoicing providers
- [ ] `confirm-mock-payment` + eligibility
- [ ] `verify-invoice4u-credentials` stub
- [ ] Migration `save_tenant_invoice4u_credentials`
- [ ] Isolation tests (grow/icount/invoice4u)
- [ ] `pnpm -C apps/web test` green
- [ ] Commit stage U1

**DB:** After migration, note that user must run `pnpm db:sync` on linked remote — do not `supabase db push` without noting blocker. Prefer writing migration file; if types needed, run `pnpm db:types:all` only if sync already possible.

### U3 — [stage-u3-frontend.md](stage-u3-frontend.md)

- [ ] Routing + bundled options + mock host
- [ ] `Invoice4uSettingsForm` + FinanceHealthCard verify map
- [ ] i18n en/he
- [ ] Tests green + commit

### U2a — [stage-u2-backend.md](stage-u2-backend.md) U2a only

- [ ] Pending payment insert on createCharge
- [ ] Form `Data=` parser + peek before JSON/Grow
- [ ] Amount verify; PaymentId upgrade; finalise then bundled doc
- [ ] Failure path
- [ ] Tests green + commit

### U4-mock — [stage-u4-mock-parity.md](stage-u4-mock-parity.md)

- [ ] `RENEWAL_TOKEN_PROVIDERS` + renewal-billing branch
- [ ] Mock renewals + refunds
- [ ] Isolation tests
- [ ] Tests green + commit

---

## Hard stops

- No live Invoice4U HTTP (no QA key assumed overnight)
- No seed/default flip to invoice4u (U5)
- No delete Grow/iCount code
- No force-push; no amend of unrelated commits
- Finance never AI-driven; no VAT recomputation in adapter — charge **gross**, docs via `IsDocCreate` / callback fields

---

## Done report (end of overnight)

Return:

1. Commits on `feat/invoice4u-provider` (hashes + messages)
2. DoD pass/fail per U1/U3/U2a/U4-mock
3. Files changed (summary)
4. Blockers (db:sync, secrets, flaky tests)
5. Exact next human step: procure QA → U0-live

---

## Copy-paste launch prompt

```
You are implementing the Invoice4U payment+invoicing wrapper overnight on branch feat/invoice4u-provider.

Follow docs/plans/finance/invoice4u/OVERNIGHT-AGENT.md exactly.
Read SPIKE-ADR D1–D20 as locked. Implement mock milestone only: U1 → U3 → U2a → U4-mock.
Commit once per stage. Do not push. Do not start U0-live or live HTTP.
Mirror Grow/iCount adapter patterns. Keep pnpm -C apps/web test green.
When done, write the Done report from OVERNIGHT-AGENT.md and stop.
```
