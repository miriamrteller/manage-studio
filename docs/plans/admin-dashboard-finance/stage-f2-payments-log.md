# Stage F2 — Payments transaction log

**Prerequisites:** F1 complete.  
**Contracts:** [CONTRACTS.md](CONTRACTS.md) — payments select, enums, `PAGE_SIZE`, provider labels.

## Goal

Admin paginated transaction log at `/admin/finance/payments` with VAT columns and filters.

## Scope IN

### Service `apps/web/src/features/finance-admin/services/paymentsLogService.ts`

- `listPayments(tenant, { page, filters })` → `{ rows, totalCount, page, pageSize }`.
- Query string **exactly** from [CONTRACTS.md](CONTRACTS.md) — `supabase.from('payments')`, **not** `TenantDB.selectFor`.
- Include `account_id` in select for payer fallback logic.
- `pageSize = 50` always; `from = (page - 1) * 50`, `to = from + 49`.
- Filters (all optional):
  - `statuses: string[]` → `.in('status', statuses)`
  - `chargeTypes: string[]` → `.in('charge_type', chargeTypes)`
  - `providers: string[]` → `.in('provider', providers)`
  - `dateFrom`, `dateTo`: filter **only** `paid_at` (see CONTRACTS). When active, show `finance.payments.date_filter_paid_only` hint in UI.
- **No payer name search** in F2 (deferred to F6).

### Zod `PaymentLogRowSchema` in `packages/shared/src/schemas.ts`

Parse each row after fetch. Export type `PaymentLogRow`.

### Hook `usePaymentsLog.ts`

Query key per CONTRACTS.md. Default `page = 1`.

### UI `PaymentsLogPage` + components

- `PaymentsLogTable.tsx` — columns per CONTRACTS (date, payer, class, pretax, vat, total, status, charge type, provider label via i18n map, payment_method, document link, engagement status).
- `PaymentsLogFilters.tsx` — `FilterMultiSelect` for status/charge_type/provider; date inputs `type="date"`.
- Payer: per CONTRACTS payer display table (text only — no student deep link in F2).
- Class column: `offering.name` (not `title`).
- Document: `<a href={invoice_url}>` only when both `external_document_number` and `invoice_url` set; `rel="noopener noreferrer"`.
- **No** refund button, **no** payment creation on this page.
- Table: `aria-label` from `finance.payments.table_label`; caption or aria-label required.

### i18n

All keys under `finance.payments.*` and `finance.provider.*` per CONTRACTS.

## Scope OUT

- Detail drawer (F6).
- CSV export (F6).
- `get_finance_summary` (F3).

## Files allowed to touch

```
packages/shared/src/schemas.ts
apps/web/src/features/finance-admin/**
apps/web/src/pages/PaymentsLogPage.tsx
apps/web/src/i18n/en.json
apps/web/src/i18n/he.json
apps/web/src/__tests__/payments-log.test.ts
apps/web/src/__tests__/finance-admin-shell.test.tsx   # update if needed
```

## Forbidden

- Migrations, RPC, edge functions.
- Fetching all payments without `.range()`.

## Tests `payments-log.test.ts`

- `PaymentLogRowSchema` parses mock row with nested person/offering.
- Filter helper: refund row displays negative `total_amount_minor`.
- Provider label maps `manual` → i18n key (mock translation).

## Commands

```bash
pnpm -C apps/web run lint
pnpm -C apps/web test payments-log
```

## Manual verification (mock tenant)

1. `pnpm run dev` → login as tenant admin.
2. Open `/admin/finance/payments` — seed/walkthrough payments visible.
3. Filter status `succeeded` — row count decreases appropriately.

Grow **not** required.

## DoD checklist

- [ ] Paginated list: 50 rows per page, total count from Supabase `count: 'exact'`
- [ ] VAT columns use `formatCurrency` + `i18n.language`
- [ ] Status + date filters work
- [ ] Refund rows show negative totals
- [ ] Document link only when URL present
- [ ] i18n he + en complete
- [ ] Lint + tests pass

## Stop condition

Post completion report. **Do not implement F3.**
