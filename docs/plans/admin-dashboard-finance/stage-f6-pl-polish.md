# Stage F6 — P&L integration, period selector, CSV export, polish

**Prerequisites:** F5 complete.  
**Contracts:** [CONTRACTS.md](CONTRACTS.md) — period URL, CSV columns, net profit.

## Goal

Full management P&L on hub, exports for accountant, navigation polish, docs updated.

## Scope IN

### Extend `get_finance_summary` (F6 migration)

**Option A (locked):** New migration `20260625000300_finance_summary_expenses.sql`:

```sql
DROP FUNCTION IF EXISTS get_finance_summary(DATE, DATE);

CREATE OR REPLACE FUNCTION get_finance_summary(...)
RETURNS TABLE (
  net_revenue_minor        BIGINT,
  payment_count            BIGINT,
  outstanding_engagements  BIGINT,
  failed_payments_7d       BIGINT,
  net_expenses_minor       BIGINT   -- NEW
)
...
```

Add expenses sum per CONTRACTS `net_expenses_minor` formula in same function body.

`net_profit_minor` computed in hook: `net_revenue_minor - net_expenses_minor`.

Update `FinanceSummarySchema` with `net_expenses_minor`.

### Period selector (`finance-admin/lib/periods.ts`)

Per CONTRACTS URL values. If `season_active` selected but no active season: fallback to `month_current` + show `finance.hub.no_active_season`.

### CSV export (`finance-admin/lib/csvExport.ts`)

- `exportPaymentsCsv(rows, filename)` — columns from CONTRACTS.
- `exportExpensesCsv(rows, filename)` — columns from CONTRACTS.
- UTF-8 BOM prefix.
- Export buttons on payments and expenses pages — export **current filter + period**, max 5000 rows; if count > 5000 show error `finance.export.too_many`.

Fetch export rows with same service filters, `range(0, 4999)`.

### Payment log polish

- `PaymentDetailDrawer.tsx` — read-only: all amounts, provider, document link, engagement id, payment id. No allocation column on `payments` — omit allocation line.
- **Payer name search** (optional): two-step pattern from CONTRACTS — resolve person IDs then `.in('person_id', ids)`; max 100 name matches.

### Admin setup link

`AdminPanel.tsx`: new card "Finance dashboard" → `/admin/finance` (i18n `finance.hub.setup_card`).

### Docs

- Update `docs/IMPLEMENTATION_STATUS.md` — admin finance row → F1–F6 complete.
- Ensure `00-overview.md` Grow deferred checklist unchanged.

## Scope OUT

- V2.7 accountant API format.
- Grow live verification.
- recharts chart (skip unless trivial bar under 80 lines).

## Files allowed to touch

```
supabase/migrations/20260625000300_finance_summary_expenses.sql   # if Option A
apps/web/src/features/finance-admin/**
apps/web/src/components/Dashboard/AdminPanel.tsx
apps/web/src/i18n/en.json
apps/web/src/i18n/he.json
docs/IMPLEMENTATION_STATUS.md
apps/web/src/__tests__/finance-pl.test.ts
apps/web/src/__tests__/csv-export.test.ts
```

## Forbidden

- Changing payment/expense immutability rules.
- Grow sandbox testing as DoD requirement.

## Tests

`finance-pl.test.ts` — net profit calculation from mocked summary values.

`csv-export.test.ts` — BOM present; Hebrew string in CSV cell.

## Commands

```bash
pnpm db:sync                    # only if Option A migration added
pnpm -C apps/web test finance-pl csv-export
pnpm -C apps/web run lint
```

## DoD checklist

- [ ] Hub shows revenue, expenses, net profit for each period option
- [ ] URL `?period=month_previous` works
- [ ] CSV exports download with Hebrew BOM
- [ ] Export respects filters; blocks >5000 rows
- [ ] Payment detail drawer read-only
- [ ] Setup hub card links to `/admin/finance`
- [ ] IMPLEMENTATION_STATUS updated
- [ ] Lint + tests pass
- [ ] RTL manual smoke on finance pages

## Stop condition

Post completion report. **Final stage** of admin dashboard finance plan.
