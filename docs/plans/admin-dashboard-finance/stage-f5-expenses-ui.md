# Stage F5 — Expenses UI, categories admin, and audit logging

**Prerequisites:** F4 complete (`create_expense` RPC live).  
**Contracts:** [CONTRACTS.md](CONTRACTS.md) — receipt upload, `p_expense_id`, RPC-only audit.

## Goal

Admin can list/create expenses (via RPC), manage categories. Audit trail via RPC only.

## Scope IN

### Optional: fix `BaseService.logAudit` (`apps/web/src/services/base.service.ts`)

Implement real `audit_log` INSERT using `actor_id: auth.uid()` (same as `user_profiles.id`).

**Do not call `logAudit` from `ExpenseService`** — `create_expense` RPC already writes audit_log. This fix is for other services only.

### Service `expenseService.ts`

- `createExpense(input)` → `supabase.rpc('create_expense', { p_expense_id, ... })` only.
- `listExpenses` — paginated SELECT, `pageSize=50`, filters on `expense_date` + `category_id`.
- `uploadReceipt(tenantId, expenseId, file)` — returns storage path per CONTRACTS.

### RPC call shape (exact)

```typescript
await supabase.rpc('create_expense', {
  p_expense_id: expenseId,
  p_category_id: input.categoryId,
  p_description: input.description,
  p_pretax_amount_minor: input.pretaxAmountMinor,
  p_vat_amount_minor: input.vatAmountMinor,
  p_total_amount_minor: input.totalAmountMinor,
  p_currency: tenant.currency,
  p_supplier_name: input.supplierName ?? null,
  p_supplier_vat_number: input.supplierVatNumber ?? null,
  p_receipt_storage_path: receiptPath ?? null,
  p_expense_date: input.expenseDate,
  p_corrects_expense_id: input.correctsExpenseId ?? null,
});
```

### Categories `expenseCategoryService.ts`

CRUD on `expense_categories` (admin RLS exists). `ExpenseCategoriesPage` replaces F1 placeholder.

### UI

- `ExpensesPage` — list + `ExpenseForm` modal.
- `ExpenseForm` — VAT via `calculateVat` / `addVatToPretax`; supplier VAT number when category VAT-eligible.
- Submit flow: generate UUID → optional upload → RPC (CONTRACTS sequence).
- `ExpenseCorrectionForm` — negates all amount fields; `[Correction]` prefix; `p_corrects_expense_id`.
- No edit on existing rows.

### Hooks

`useExpenses`, `useExpenseCategories` — query keys from CONTRACTS.

## Scope OUT

- P&L hub (F6).
- CSV export (F6).

## Files allowed to touch

```
apps/web/src/services/base.service.ts          # optional logAudit fix
apps/web/src/features/finance-admin/**
apps/web/src/pages/ExpensesPage.tsx
apps/web/src/pages/ExpenseCategoriesPage.tsx
apps/web/src/i18n/en.json
apps/web/src/i18n/he.json
apps/web/src/__tests__/expense-form.test.ts
apps/web/src/__tests__/expenses-list.test.ts
```

## Forbidden

- `.from('expenses').insert()` or `.update()` from client.
- `logAudit` on expense create (RPC handles audit).

## Tests

- VAT inclusive/exclusive math.
- Correction row negative amounts.
- Mock RPC called with `p_expense_id`.

## DoD checklist

- [ ] Creates via RPC with pre-generated `p_expense_id`
- [ ] Receipt upload path matches `{tenant}/{id}/receipt.{ext}`
- [ ] Categories CRUD works
- [ ] Exactly one `audit_log` row per create (from RPC, not client)
- [ ] i18n he + en
- [ ] Lint + tests pass

## Stop condition

Post completion report. **Do not implement F6.**
