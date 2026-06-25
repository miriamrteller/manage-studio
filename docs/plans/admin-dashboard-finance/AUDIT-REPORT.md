# Plan audit report — admin dashboard finance

## First audit (2026-06-24)

Initial gaps: client-side SUM, direct expense INSERT, RLS immutability, logAudit no-op, wrong VAT API, terms vs seasons, optional scope drift, receipt upload order.

Resolved in: [CONTRACTS.md](CONTRACTS.md), stage file rewrites, `.cursor/rules/admin-finance-stages.mdc`, `pnpm finance-admin:prompt`.

---

## Second audit (2026-06-24) — findings and fixes

### Critical (would break implementation or compliance)

| # | Issue | Risk | Fix applied |
| --- | --- | --- | --- |
| C1 | `offerings.title` in CONTRACTS select | PostgREST error — column is `name` | CONTRACTS + F2: `offerings!…(id, name)` |
| C2 | `TenantDB.selectFor` + custom join select | `selectFor` only supports `select('*')` | CONTRACTS: explicit `supabase.from('payments').select(…).eq('tenant_id', …)` |
| C3 | Receipt upload pre-generates UUID but RPC has no `p_expense_id` | Immutable table can't fix path after insert | F4 + CONTRACTS: `p_expense_id UUID` param; RPC uses it as row `id` |
| C4 | Duplicate audit on expense create (RPC + `logAudit`) | Double audit rows or conflicting stories | Audit **only in `create_expense` RPC**; F5 does not call `logAudit` for expenses |
| C5 | `get_finance_summary` auth guard underspecified | Data leak if RPC callable by parent | F3: full auth block copied from `search_enrolment_students` pattern |
| C6 | F6 “extend RPC return type” | PostgreSQL `CREATE OR REPLACE` can't add columns to RETURNS TABLE | F6: `DROP FUNCTION` then recreate, or new `get_finance_summary_v2` — locked to DROP+CREATE |

### High (scalability / correctness)

| # | Issue | Risk | Fix applied |
| --- | --- | --- | --- |
| H1 | Date filter on payments ambiguous (`paid_at` vs `created_at`) | Wrong rows in filtered views | CONTRACTS: date filter applies to `paid_at` only; pending excluded when date filter active; UI hint i18n |
| H2 | Payer when `person_id` null (`account_id` payments) | Blank payer column | CONTRACTS: show `finance.payments.family_payment` label |
| H3 | No active season | Outstanding count undefined | CONTRACTS + F3: count = 0, list empty, `finance.hub.no_active_season` |
| H4 | F2 search in CONTRACTS but not in F2 scope | Agent builds half-feature | Search **deferred to F6**; removed from F2 requirements |
| H5 | Correction rows: only `total` sign constrained | Inconsistent pretax/vat signs | F4: correction requires all amount fields <= 0 |
| H6 | `create_expense` VAT recompute “duplicate in PL/pgSQL” vague | Agent invents wrong math | F4: exact PL/pgSQL algorithm documented (mirror `calculateVat` / `addVatToPretax`) |
| H7 | F5 `getCurrentProfileId()` helper doesn't exist | Build failure | F5: `actor_id = auth.uid()` (`user_profiles.id` = `auth.uid()`) |

### Medium (maintainability / legal clarity)

| # | Issue | Risk | Fix applied |
| --- | --- | --- | --- |
| M1 | P&L disclaimer doesn't mention input VAT / accountant | Misread as tax filing | Disclaimer i18n keys expanded in CONTRACTS |
| M2 | `supplier_vat_number` validation vague | Bad reclaim data | CONTRACTS: normalize to 9 digits; regex `^\d{9}$` after strip |
| M3 | F6 `season_active` with no active season | Crash or wrong range | F6: fallback to `month_current` + banner |
| M4 | Student deep link from payments log unspecified | F2 scope creep | F2: payer name text only (no `?highlight` — not implemented on students page) |
| M5 | `BaseService.logAudit` fix scope unclear | Unnecessary churn | F5: implement `logAudit` but **do not use** for expense creates |
| M6 | Storage INSERT policy for receipts | Upload fails in prod | F4: explicit storage policies (admin INSERT + SELECT own tenant) |

### Low (already OK / no change)

- Grow deferred checklist — still correct.
- Immutable payments — read-only log — correct.
- `PAGE_SIZE=50` — matches `useStudents`.
- No FORCE RLS — `SECURITY DEFINER` RPC bypass is intentional and standard for financial writes.
- Expense categories seeded in `provision_tenant` — confirmed.

---

## Agent-readiness score (second pass)

| Criterion | Status |
| --- | --- |
| Locked contracts | ✅ [CONTRACTS.md](CONTRACTS.md) |
| Per-stage allow/deny lists | ✅ stage-f*.md |
| RPC auth + SQL templates | ✅ F3/F4 expanded |
| No column name hallucinations | ✅ fixed `offerings.name` |
| Receipt + immutable ID flow | ✅ `p_expense_id` |
| Single audit path for expenses | ✅ RPC only |
| Scalable list queries | ✅ pagination + RPC aggregates |
| Legal disclaimers | ✅ expanded |
| Grow not blocking | ✅ |

**Remaining intentional deferrals:** payer search (F6), student slide-over deep link (future), Grow live sandbox (external blocker).

---

## Deferred (unchanged)

Grow live sandbox verification — blocked on Meshulam access / registered business. Mock + walkthrough remain acceptance path for payment UI.
