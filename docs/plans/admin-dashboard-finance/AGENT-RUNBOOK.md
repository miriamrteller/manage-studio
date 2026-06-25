# Admin dashboard finance — Agent runbook (F1–F6)

Generate prompt: `pnpm finance-admin:prompt f1` (… `f6`).

**Every session:**

1. Attach `@docs/plans/admin-dashboard-finance/CONTRACTS.md` (mandatory).
2. Attach `@.cursor/rules/admin-finance-stages.mdc`.
3. Implement **one** stage only.
4. Post **completion report** (template at bottom).
5. **Stop** — do not start the next stage.

**Grow live sandbox:** not required for any F stage. Use mock tenant + walkthrough.

---

## Stage F1 — Shell

```
Implement Stage F1 only.

@docs/plans/admin-dashboard-finance/CONTRACTS.md
@docs/plans/admin-dashboard-finance/00-overview.md
@docs/plans/admin-dashboard-finance/stage-f1-shell.md
@.cursor/rules/admin-finance-stages.mdc
@.instructions.md
@apps/web/src/router.tsx
@apps/web/src/components/Navigation/navigationConfig.ts
@apps/web/src/layouts/RouteGuards.tsx

Goal: /admin/finance routes + nav + hub shell (no data queries).

Commands:
  pnpm -C apps/web run lint
  pnpm -C apps/web test finance-admin-shell

Stop after F1 DoD. Do not start F2.
```

---

## Stage F2 — Payments log

```
Implement Stage F2 only.

@docs/plans/admin-dashboard-finance/CONTRACTS.md
@docs/plans/admin-dashboard-finance/00-overview.md
@docs/plans/admin-dashboard-finance/stage-f2-payments-log.md
@.cursor/rules/admin-finance-stages.mdc
@.instructions.md
@packages/shared/src/schemas.ts
@apps/web/src/features/students/components/StudentsList.tsx
@apps/web/src/lib/db.ts
@packages/shared/src/format.ts

Goal: paginated payments log at /admin/finance/payments (PAGE_SIZE=50).

Commands:
  pnpm -C apps/web run lint
  pnpm -C apps/web test payments-log

Stop after F2 DoD. Do not start F3.
```

---

## Stage F3 — Hub metrics RPC

```
Implement Stage F3 only.

@docs/plans/admin-dashboard-finance/CONTRACTS.md
@docs/plans/admin-dashboard-finance/00-overview.md
@docs/plans/admin-dashboard-finance/stage-f3-overview-metrics.md
@.cursor/rules/admin-finance-stages.mdc
@.instructions.md
@apps/web/src/lib/constants.ts
@apps/web/src/lib/utils.ts
@supabase/migrations/20260608000500_offerings.sql

Goal: get_finance_summary RPC + hub metric cards + outstanding list.

After migration: ask user to confirm, then pnpm db:sync.

Commands:
  pnpm -C apps/web test finance-summary
  pnpm -C apps/web run lint

Stop after F3 DoD. Do not start F4.
```

---

## Stage F4 — Expenses schema

```
Implement Stage F4 only.

@docs/plans/admin-dashboard-finance/CONTRACTS.md
@docs/plans/admin-dashboard-finance/00-overview.md
@docs/plans/admin-dashboard-finance/stage-f4-expenses-schema.md
@.cursor/rules/admin-finance-stages.mdc
@.instructions.md
@SPEC.md
@supabase/migrations/20260608000600_communications.sql
@supabase/migrations/20260608001700_storage.sql
@supabase/migrations/20260608000700_audit_security.sql
@packages/shared/src/schemas.ts
@packages/shared/src/pricing.ts

Goal: expenses table, immutability triggers, create_expense RPC, expense-receipts bucket. No UI.

After migration: ask user to confirm, then pnpm db:sync.

Commands:
  pnpm -C apps/web test schemas.test.ts

Stop after F4 DoD. Do not start F5.
```

---

## Stage F5 — Expenses UI

```
Implement Stage F5 only.

@docs/plans/admin-dashboard-finance/CONTRACTS.md
@docs/plans/admin-dashboard-finance/00-overview.md
@docs/plans/admin-dashboard-finance/stage-f5-expenses-ui.md
@.cursor/rules/admin-finance-stages.mdc
@.instructions.md
@apps/web/src/services/base.service.ts
@apps/web/src/features/people/service.ts
@packages/shared/src/pricing.ts

Goal: expenses list/create via RPC, categories admin, real logAudit, receipt upload.

Commands:
  pnpm -C apps/web test expense-form expenses-list
  pnpm -C apps/web run lint

Stop after F5 DoD. Do not start F6.
```

---

## Stage F6 — P&L polish

```
Implement Stage F6 only.

@docs/plans/admin-dashboard-finance/CONTRACTS.md
@docs/plans/admin-dashboard-finance/00-overview.md
@docs/plans/admin-dashboard-finance/stage-f6-pl-polish.md
@.cursor/rules/admin-finance-stages.mdc
@.instructions.md
@docs/IMPLEMENTATION_STATUS.md
@apps/web/src/components/Dashboard/AdminPanel.tsx

Goal: P&L on hub, period URL, CSV exports, setup hub link, status doc.

Commands:
  pnpm -C apps/web test finance-pl csv-export
  pnpm -C apps/web run lint

Stop after F6 DoD. Final stage.
```

---

## Completion report template

```markdown
## Stage FN completion report

### DoD
- [ ] item — PASS/FAIL — notes

### Files changed
- path

### Commands
- command → result

### Blockers
- none | description

### Stop
Waiting for user to say "commit Stage FN".
```
