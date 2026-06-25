# Stage F4 — Expenses schema, RLS, storage, and create_expense RPC

**Prerequisites:** F3 complete (migration numbering: F4 file timestamp after F3).  
**Contracts:** [CONTRACTS.md](CONTRACTS.md) — `create_expense`, receipt bucket, immutability.

## Goal

Database layer for immutable expenses; **no UI** in this stage.

## Scope IN

### Migration `supabase/migrations/20260625000200_expenses.sql`

#### Table `expenses`

```sql
CREATE TABLE expenses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  category_id           UUID NOT NULL REFERENCES expense_categories(id),
  description           TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  pretax_amount_minor   INT NOT NULL,
  vat_amount_minor      INT NOT NULL DEFAULT 0 CHECK (vat_amount_minor >= 0),
  total_amount_minor    INT NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'ILS',
  supplier_name         TEXT CHECK (char_length(supplier_name) <= 200),
  supplier_vat_number   TEXT CHECK (char_length(supplier_vat_number) <= 20),
  receipt_storage_path  TEXT,
  expense_date          DATE NOT NULL,
  corrects_expense_id   UUID REFERENCES expenses(id),
  created_by            UUID NOT NULL REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expenses_total_check CHECK (total_amount_minor = pretax_amount_minor + vat_amount_minor),
  CONSTRAINT expenses_correction_sign CHECK (
    corrects_expense_id IS NULL OR (
      total_amount_minor <= 0 AND pretax_amount_minor <= 0 AND vat_amount_minor <= 0
    )
  )
);
```

**Category tenant match:** PostgreSQL does not allow subquery CHECK on same row reliably — use `BEFORE INSERT` trigger `validate_expense_category_tenant()`:

```sql
CREATE OR REPLACE FUNCTION validate_expense_category_tenant()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM expense_categories c
    WHERE c.id = NEW.category_id AND c.tenant_id = NEW.tenant_id AND c.is_active = true
  ) THEN
    RAISE EXCEPTION 'invalid or inactive expense category for tenant';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_validate_category
  BEFORE INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION validate_expense_category_tenant();
```

Indexes:

- `idx_expenses_tenant_date ON expenses(tenant_id, expense_date DESC)`
- `idx_expenses_tenant_category ON expenses(tenant_id, category_id)`

#### Immutability

```sql
CREATE OR REPLACE FUNCTION reject_expense_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'expenses are immutable';
END;
$$;

CREATE TRIGGER expenses_no_update BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION reject_expense_mutation();
CREATE TRIGGER expenses_no_delete BEFORE DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION reject_expense_mutation();
```

#### RLS

- `ENABLE ROW LEVEL SECURITY`
- `expenses_super_admin` FOR ALL USING `is_super_admin()`
- `expenses_admin_select` FOR SELECT USING tenant_admin check (same pattern as payments)
- **No** INSERT policy for authenticated — inserts only via RPC.

#### Grants (in same migration)

```sql
GRANT SELECT ON public.expenses TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.expenses FROM authenticated;
GRANT EXECUTE ON FUNCTION create_expense(UUID, UUID, TEXT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT, DATE, UUID) TO authenticated;
```

Function signature must match [CONTRACTS.md](CONTRACTS.md) — includes `p_expense_id` as first argument.

#### RPC `create_expense`

Implement full function per CONTRACTS.md:

- Auth guard identical to `search_enrolment_students`.
- VAT recomputation algorithm documented in CONTRACTS (mirror `calculateVat` / `addVatToPretax`).
- `INSERT` with `id = p_expense_id`.
- `audit_log` insert inside RPC (**sole** audit path for expenses).

#### Storage bucket `expense-receipts`

Mirror `waiver-pdfs` pattern plus **admin INSERT**:

```sql
CREATE POLICY "Admins insert own tenant expense receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)
    )
  );

CREATE POLICY "Admins read own tenant expense receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND 'tenant_admin' = ANY(role)
    )
  );
```

Path: `{tenant_id}/{expense_id}/receipt.{ext}` only.

### Shared Zod (`packages/shared/src/schemas.ts`)

- `ExpenseSchema` — full row.
- `ExpenseCreateInputSchema` — maps to RPC args including `p_expense_id`.
- **Do not** add `FinanceSummarySchema` here (F3 owns it).

### Tests

- `schemas.test.ts` — ExpenseCreateInputSchema validation cases.
- Document manual RLS check in DoD.

## Scope OUT

- UI (F5).
- `BaseService.logAudit` (F5).

## Workflow

1. Add migration.
2. Ask user: **"F4 migration ready — confirm db:sync"**.
3. `pnpm db:sync`.

## Files allowed to touch

```
supabase/migrations/20260625000200_expenses.sql
packages/shared/src/schemas.ts
apps/web/src/__tests__/schemas.test.ts
```

## Forbidden

- Editing prior migration files.
- Direct INSERT grant on `expenses`.
- Expense UI.

## Commands

```bash
pnpm db:sync
pnpm -C apps/web test schemas.test.ts
```

## DoD checklist

- [ ] `expenses` table + triggers prevent UPDATE/DELETE
- [ ] `create_expense` RPC inserts row + audit_log
- [ ] Parent role cannot SELECT expenses (manual RLS test)
- [ ] `expense-receipts` bucket policies applied
- [ ] No INSERT grant on `expenses` for authenticated
- [ ] Zod schemas exported; schema tests pass
- [ ] Types regenerated

## Stop condition

Post completion report. **Do not implement F5.**
