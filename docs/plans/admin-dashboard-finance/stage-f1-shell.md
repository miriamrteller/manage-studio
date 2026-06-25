# Stage F1 — Finance routes, navigation, and hub shell

**Prerequisites:** None.  
**Contracts:** [CONTRACTS.md](CONTRACTS.md) — routes table only.

## Goal

`/admin/finance` exists in nav and router; hub + placeholder child pages render without data queries.

## Scope IN (exact)

### Router (`apps/web/src/router.tsx`)

Add inside `RootLayout` children, each wrapped in `<AdminRoute>`:

| Path | Import | Component |
| --- | --- | --- |
| `admin/finance` | `./pages/FinanceHubPage` | default export |
| `admin/finance/payments` | `./pages/PaymentsLogPage` | default export |
| `admin/finance/expenses` | `./pages/ExpensesPage` | default export |
| `admin/finance/expenses/categories` | `./pages/ExpenseCategoriesPage` | default export |

### Navigation (`navigationConfig.ts`)

Insert after `nav.students` entry:

```typescript
{
  path: '/admin/finance',
  labelKey: 'nav.finance',
  requiredRoles: ['tenant_admin'],
  sectionKey: 'administration',
}
```

### Pages (thin — max 30 lines each)

- `FinanceHubPage.tsx` → `<FinanceHub />` from feature folder.
- `PaymentsLogPage.tsx` → `<PaymentsLogPlaceholder />`.
- `ExpensesPage.tsx` → `<ExpensesPlaceholder />` with text key `finance.expenses.coming_soon`.
- `ExpenseCategoriesPage.tsx` → placeholder with `finance.categories.coming_soon`.

### Feature folder `apps/web/src/features/finance-admin/`

```
finance-admin/
  components/
    FinanceHub.tsx          # title, description, 2 Link cards (payments, expenses)
    PaymentsLogPlaceholder.tsx
    ExpensesPlaceholder.tsx
    ExpenseCategoriesPlaceholder.tsx
  index.ts                  # re-exports
```

**Do not** put logic in `features/finance/` (that folder is payment modals + walkthrough).

### i18n keys (add to both `en.json` and `he.json`)

- `nav.finance`
- `finance.hub.title`, `finance.hub.description`
- `finance.hub.card_payments`, `finance.hub.card_expenses`
- `finance.expenses.coming_soon`, `finance.categories.coming_soon`

## Scope OUT

- Data hooks, RPC, migrations, CSV, P&L disclaimer (F3/F6).

## Files allowed to touch

```
apps/web/src/router.tsx
apps/web/src/components/Navigation/navigationConfig.ts
apps/web/src/pages/FinanceHubPage.tsx
apps/web/src/pages/PaymentsLogPage.tsx
apps/web/src/pages/ExpensesPage.tsx
apps/web/src/pages/ExpenseCategoriesPage.tsx
apps/web/src/features/finance-admin/**
apps/web/src/i18n/en.json
apps/web/src/i18n/he.json
apps/web/src/__tests__/finance-admin-shell.test.tsx   # new
```

## Forbidden

- Editing `supabase/**`, `packages/shared/**`, payment/enrolment features.
- Adding npm dependencies.

## Tests

`apps/web/src/__tests__/finance-admin-shell.test.tsx`:

- `FinanceHub` renders title and two navigation links.
- Mock `useCurrentUser` with `tenant_admin` → nav config includes finance item.

## Commands

```bash
pnpm -C apps/web run lint
pnpm -C apps/web test finance-admin-shell
```

## DoD checklist

- [ ] All four routes load behind `AdminRoute` (manual or test)
- [ ] `nav.finance` visible for `tenant_admin`, not for parent role in nav filter test
- [ ] Hub cards link to `/admin/finance/payments` and `/admin/finance/expenses`
- [ ] Placeholder pages show i18n coming-soon text (expenses + categories)
- [ ] No Supabase queries in F1 components
- [ ] Lint + tests pass

## Stop condition

Post completion report. **Do not implement F2.**
