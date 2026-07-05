# Stage F3 — Finance hub metrics and outstanding payments

**Prerequisites:** F2 complete.  
**Contracts:** [CONTRACTS.md](CONTRACTS.md) — `get_finance_summary`, net revenue formula, seasons.

## Goal

`/admin/finance` shows net revenue, counts, outstanding engagements, and P&L disclaimers.

## Scope IN

### Migration (post-squash authoritative path)

**Folded into:** `supabase/migrations/20260608001600_finance.sql` (`get_finance_summary`).  
**Archived incremental:** `migrations_backup/incremental_20260705/20260625000200_finance_summary_rpc.sql`

Implement `get_finance_summary(p_start_date DATE, p_end_date DATE)` with **exact auth guard** from `search_enrolment_students` (see `20260608002200_admin_enrolment_rpcs.sql` lines 25–40):

```sql
CREATE OR REPLACE FUNCTION get_finance_summary(
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  net_revenue_minor        BIGINT,
  payment_count            BIGINT,
  outstanding_engagements  BIGINT,
  failed_payments_7d       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_season_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_tenant_id := get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  SELECT id INTO v_season_id
  FROM seasons
  WHERE tenant_id = v_tenant_id AND status = 'active'
  LIMIT 1;

  RETURN QUERY
  SELECT
    COALESCE((
      SELECT SUM(total_amount_minor)
      FROM payments
      WHERE tenant_id = v_tenant_id
        AND status IN ('succeeded', 'partially_refunded')
        AND paid_at IS NOT NULL
        AND paid_at::date BETWEEN p_start_date AND p_end_date
    ), 0)::bigint,
    COALESCE((
      SELECT COUNT(*)
      FROM payments
      WHERE tenant_id = v_tenant_id
        AND status = 'succeeded'
        AND charge_type IN ('initial', 'renewal')
        AND paid_at IS NOT NULL
        AND paid_at::date BETWEEN p_start_date AND p_end_date
    ), 0)::bigint,
    COALESCE((
      SELECT COUNT(*)
      FROM engagements
      WHERE tenant_id = v_tenant_id
        AND status = 'pending_payment'
        AND season_id IS NOT DISTINCT FROM v_season_id
    ), 0)::bigint,
    COALESCE((
      SELECT COUNT(*)
      FROM payments
      WHERE tenant_id = v_tenant_id
        AND status = 'failed'
        AND created_at >= (now() - interval '7 days')
    ), 0)::bigint;
END;
$$;

GRANT EXECUTE ON FUNCTION get_finance_summary(DATE, DATE) TO authenticated;
```

Note: when `v_season_id` IS NULL, outstanding count is 0 (`season_id IS NOT DISTINCT FROM NULL` matches only null season_id engagements).

### Shared Zod

`FinanceSummarySchema` in `packages/shared/src/schemas.ts` (F3 — not F4).

### Hook `useFinanceSummary.ts`

- Default period: current Jerusalem month via `finance-admin/lib/periods.ts` + `TIMEZONE` from `lib/constants.ts`.
- `supabase.rpc('get_finance_summary', { p_start_date, p_end_date })`.

### UI `FinanceHub.tsx`

- Disclaimer banners: `finance.disclaimer.management_pl` + `finance.disclaimer.input_vat`.
- Summary cards with `formatCurrency`.
- Outstanding table (max 10): query `engagements` where `pending_payment` + active `season_id` (if no active season: empty + `finance.hub.no_active_season`).
- Enrich with person/offering names via nested select.
- Actions: link to `/enrol/pay/{engagementId}`; link to `/admin/students`.
- Quick links: payments log, students.

## Scope OUT

- Expense metrics (F6).
- Period URL selector (F6).

## Workflow

1. Add migration.
2. Ask user: **"F3 migration ready — confirm db:sync"**.
3. `pnpm db:sync`.

## Files allowed to touch

```
supabase/migrations/20260625000100_finance_summary_rpc.sql
packages/shared/src/schemas.ts
apps/web/src/features/finance-admin/**
apps/web/src/pages/FinanceHubPage.tsx
apps/web/src/i18n/en.json
apps/web/src/i18n/he.json
apps/web/src/__tests__/finance-summary.test.ts
```

## Tests `finance-summary.test.ts`

- `getJerusalemMonthRange` for known date.
- `FinanceSummarySchema` parses RPC row.

## Commands

```bash
pnpm db:sync                    # after user confirms
pnpm -C apps/web test finance-summary
pnpm -C apps/web run lint
```

## DoD checklist

- [ ] RPC rejects non-admin callers
- [ ] Hub metrics match CONTRACTS formulas on mock seed
- [ ] No active season → outstanding 0 + i18n message
- [ ] Both disclaimer keys visible
- [ ] Lint + tests pass

## Stop condition

Post completion report. **Do not implement F4.**
