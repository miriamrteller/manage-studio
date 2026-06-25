# Admin dashboard finance — locked contracts

**Agents must not deviate from this file.** If implementation conflicts, stop and ask the user.

## Constants

| Name | Value | Where |
| --- | --- | --- |
| `PAGE_SIZE` | `50` | All finance-admin list hooks |
| `TIMEZONE` | `Asia/Jerusalem` | Import from `apps/web/src/lib/constants.ts` |
| `SIGNED_URL_TTL_SEC` | `60` | Receipt preview |
| `RECEIPT_MAX_BYTES` | `5242880` (5 MB) | Upload validation |
| `RECEIPT_BUCKET` | `expense-receipts` | Storage |
| `RECEIPT_MIME` | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` | Upload validation |

## Routes (exact)

| Path | Page component | Guard |
| --- | --- | --- |
| `/admin/finance` | `FinanceHubPage` | `AdminRoute` |
| `/admin/finance/payments` | `PaymentsLogPage` | `AdminRoute` |
| `/admin/finance/expenses` | `ExpensesPage` | `AdminRoute` |
| `/admin/finance/expenses/categories` | `ExpenseCategoriesPage` | `AdminRoute` |

Nav: `navigationConfig.ts` — `path: '/admin/finance'`, `labelKey: 'nav.finance'`, `sectionKey: 'administration'`, `requiredRoles: ['tenant_admin']`.

## Money formulas

### Net revenue (P&L — payments side)

Period filter: `paid_at` **inclusive** between `start_date` and `end_date` (DATE, Jerusalem calendar).

```text
net_revenue_minor =
  SUM(total_amount_minor)
  WHERE tenant_id = current tenant
    AND status IN ('succeeded', 'partially_refunded')
    AND paid_at IS NOT NULL
    AND paid_at::date BETWEEN start_date AND end_date
```

- Refund rows (`charge_type = 'refund'`) have **negative** `total_amount_minor` — include in SUM.
- Do **not** filter by `charge_type` for revenue sum (refunds must net out).
- Pending/failed rows are **excluded**.

### Net expenses (P&L — expenses side)

Period filter: `expense_date` inclusive between `start_date` and `end_date`.

```text
net_expenses_minor =
  SUM(total_amount_minor)
  WHERE tenant_id = current tenant
    AND expense_date BETWEEN start_date AND end_date
```

Correction rows have negative `total_amount_minor` — include in SUM.

### Net profit

```text
net_profit_minor = net_revenue_minor - net_expenses_minor
```

Display label: **management P&L** — disclaimer keys:

- `finance.disclaimer.management_pl` — not a tax return; accountant validates.
- `finance.disclaimer.input_vat` — expense VAT is bookkeeping; reclaim rules are accountant's domain.

### VAT breakdown for new expenses (UI + RPC validation)

Use `@shared/pricing` only — **never** `resolveOfferingPrice` (that is for catalogue offerings).

| Tenant `prices_include_vat` | User enters | Function |
| --- | --- | --- |
| `true` (default) | Total (gross) | `calculateVat(totalMinor, vatRate)` |
| `false` | Pretax (net) | `addVatToPretax(pretaxMinor, vatRate)` |

`vatRate = Number(tenant.vat_rate ?? 0.17)`.

If `category.is_vat_eligible === false`: force `vat_amount_minor = 0`, `total = pretax`.

RPC must recompute and reject if client amounts differ from server recomputation.

## Enums (display only — DB may add values)

### `payments.status`

`succeeded` | `failed` | `pending` | `refunded` | `partially_refunded` | `disputed`

### `payments.charge_type`

`initial` | `renewal` | `setup` | `adjustment` | `refund`

### `payments.provider` (column `provider`)

| DB value | i18n key |
| --- | --- |
| `manual` | `finance.provider.manual` |
| `mock` | `finance.provider.mock` |
| `grow` | `finance.provider.grow` |
| `stripe` | `finance.provider.stripe` |

### `payments.payment_method`

`card` | `cash` | `bank_transfer` | `other` | null

### `engagements.status` (outstanding filter)

Outstanding = `status = 'pending_payment'` AND `season_id` = active season id.

If **no** active season exists: `outstanding_engagements = 0`, list empty, show `finance.hub.no_active_season`.

Active season query:

```typescript
supabase.from('seasons').select('id').eq('tenant_id', tenantId).eq('status', 'active').maybeSingle()
```

**Never** use `terms` or `is_current` — those do not exist in this repo.

## Payments log — Supabase query (F2)

**Do not use `TenantDB.selectFor` for joins** — it only supports `select('*')`. Use:

```typescript
if (!tenant?.id) throw new Error('Tenant ID required');
const from = (page - 1) * PAGE_SIZE;
const to = from + PAGE_SIZE - 1;

supabase
  .from('payments')
  .select(
    `
    id, person_id, account_id, offering_id, engagement_id,
    pretax_amount_minor, vat_amount_minor, total_amount_minor, currency,
    status, charge_type, provider, payment_method,
    paid_at, created_at, external_document_number, invoice_url,
    person:people!payments_person_id_fkey(id, name),
    offering:offerings!payments_offering_id_fkey(id, name),
    engagement:engagements!payments_engagement_id_fkey(id, status)
  `,
    { count: 'exact' },
  )
  .eq('tenant_id', tenant.id)
  .order('created_at', { ascending: false })
  .range(from, to);
```

**Payer display:**

| Condition | Display |
| --- | --- |
| `person_id` set + `person.name` | `person.name` (text only in F2 — no student deep link) |
| `person_id` null, `account_id` set | i18n `finance.payments.family_payment` |
| Both null | `—` |

**Date filter (locked):** When `dateFrom`/`dateTo` set, filter **only** `paid_at` (`.gte('paid_at', …).lte('paid_at', …)`). Rows with `paid_at IS NULL` (pending) are **excluded** from filtered results. Show hint `finance.payments.date_filter_paid_only` when date filter active.

**Search:** Deferred to **F6** (not F2). Do not implement payer name search in F2.

## RPC: `get_finance_summary` (F3 migration)

```sql
-- Returns one row. SECURITY DEFINER, tenant from get_my_tenant_id().
-- Parameters: p_start_date DATE, p_end_date DATE (inclusive)
net_revenue_minor BIGINT
payment_count BIGINT        -- succeeded initial+renewal in period (excludes refunds)
outstanding_engagements BIGINT
failed_payments_7d BIGINT
```

`payment_count`: `status = 'succeeded' AND charge_type IN ('initial','renewal') AND paid_at in range`.

## RPC: `create_expense` (F4 migration)

```sql
CREATE OR REPLACE FUNCTION create_expense(
  p_expense_id            UUID,
  p_category_id           UUID,
  p_description           TEXT,
  p_pretax_amount_minor   INT,
  p_vat_amount_minor      INT,
  p_total_amount_minor    INT,
  p_currency              TEXT,
  p_supplier_name         TEXT,
  p_supplier_vat_number   TEXT,
  p_receipt_storage_path  TEXT,
  p_expense_date          DATE,
  p_corrects_expense_id   UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

**Auth guard (required — copy from `search_enrolment_students`):**

1. `auth.uid()` IS NOT NULL → else `Authentication required`
2. `tenant_admin` OR `super_admin` on `user_profiles` → else `Forbidden`
3. `v_tenant_id := get_my_tenant_id()` IS NOT NULL → else `Tenant not found`

**Parameters (validated server-side):**

| Param | Rules |
| --- | --- |
| `p_expense_id` | Required; client pre-generates for receipt path; must not already exist |
| `p_category_id` | Active category for `v_tenant_id` |
| `p_description` | 1–500 chars; if `p_corrects_expense_id` set, must start with `[Correction]` |
| `p_pretax_amount_minor`, `p_vat_amount_minor`, `p_total_amount_minor` | Must equal server recomputation (below). Normal: all > 0. Correction: all <= 0 |
| `p_currency` | Must equal `tenants.currency` |
| `p_supplier_vat_number` | Required when category `is_vat_eligible` and `p_vat_amount_minor > 0`. After stripping non-digits, must match `^\d{9}$` |
| `p_receipt_storage_path` | If set: must equal `{tenant_id}/{p_expense_id}/receipt.{ext}` |
| `p_expense_date` | `<= (now() AT TIME ZONE 'Asia/Jerusalem')::date` |
| `p_corrects_expense_id` | Optional; original same tenant; correction amounts all <= 0 |

**VAT server recomputation (must match `@shared/pricing`):**

- Read `tenants.vat_rate`, `tenants.prices_include_vat`, category `is_vat_eligible`.
- If not VAT-eligible: expected `vat=0`, `total=pretax`.
- If `prices_include_vat`: client sends total → `pretax = round(total/(1+rate))`, `vat = total - pretax`.
- If exclusive: client sends pretax → `vat = round(pretax*rate)`, `total = pretax + vat`.
- Reject if client triple != expected triple.

**Insert:** `id = p_expense_id`, `tenant_id = v_tenant_id`, `created_by = auth.uid()`.

**Audit:** single `audit_log` row inside RPC (`CREATE`, `expenses`, `p_expense_id`). **Do not** duplicate in client `logAudit`.

Returns: `p_expense_id`.

## Receipt upload sequence (F5)

1. `expenseId = crypto.randomUUID()`
2. Validate file size (`<= RECEIPT_MAX_BYTES`) + MIME client-side.
3. If file present: upload to `{tenant_id}/{expenseId}/receipt.{ext}` (ext from file, lowercase).
4. Call `create_expense` with `p_expense_id = expenseId` and `p_receipt_storage_path` = full path (or null if no file).
5. On RPC failure after upload: `storage.remove([path])` best-effort.

Preview: `supabase.storage.from('expense-receipts').createSignedUrl(path, 60)`.

## Query keys (React Query)

| Hook | Key |
| --- | --- |
| `useFinanceSummary` | `['finance-summary', tenantId, startDate, endDate]` |
| `usePaymentsLog` | `['payments-log', tenantId, page, filters]` |
| `useExpenses` | `['expenses', tenantId, page, filters]` |
| `useExpenseCategories` | `['expense-categories', tenantId]` |

## Period selector URL (F6)

Query param: `period` with values:

| Value | Meaning |
| --- | --- |
| `month_current` | Jerusalem calendar month containing today |
| `month_previous` | Prior calendar month |
| `season_active` | `start_date`/`end_date` of season where `status='active'` |

Default: `month_current`. Persist in URL; hub reads `useSearchParams`.

## CSV export columns (F6)

Payments: `paid_date`, `payer_name`, `offering_title`, `pretax_minor`, `vat_minor`, `total_minor`, `currency`, `status`, `charge_type`, `provider`, `payment_method`, `external_document_number`, `engagement_id`, `payment_id`

Expenses: `expense_date`, `category_name`, `description`, `pretax_minor`, `vat_minor`, `total_minor`, `currency`, `supplier_name`, `supplier_vat_number`, `corrects_expense_id`, `expense_id`

Encoding: UTF-8 with BOM (`\uFEFF` prefix). Filename: `{kind}-{subdomain}-{period}.csv`.

## Forbidden

- `UPDATE` or `DELETE` on `expenses` or `payments` from admin finance UI.
- Inline refund on payments log (use `StudentSlideOver` + `RefundPaymentModal`).
- `invoice_sequences` / `next_invoice_number` in UI.
- AI on amounts, VAT, or P&L totals.
- Physical CSS (`ml-`, `mr-`) in new components.
- New npm packages without user approval + `pnpm dlx snyk test`.
