# Phase 1F — Admin operations overview (paste into new agent chat)

> **Shipped.** RPC folded into `20260608002000_admin_rpcs.sql` (third squash, 2026-07-05). Archived incremental: `migrations_backup/incremental_20260705/20260626000300_admin_dashboard_overview_rpc.sql`.

## Mission

Replace the **placeholder** `useAdminDashboard` with a real **operations overview** on `/admin/setup` and `/dashboard/admin`: today's classes, enrolments this term, revenue/outstanding this month, and quick-action links. Reuse existing finance RPCs where possible.

**Repo:** `manage-studio`  
**SPEC:** §Phase 1F — Overview (`today's classes`, `enrolments this term`, `revenue this month`, `outstanding payments`, `quick actions`)  
**Depends on:** Finance F3 (`get_finance_summary`) ✅ · Grow G7 optional (health card already on page)  
**Out of scope:** People directory export, classes admin CRUD (already elsewhere), notification blast (separate plan), P&L detail (finance hub)

---

## Current state (verified 2026-06-25)

| Item | Status |
| --- | --- |
| `useAdminDashboard.ts` | Placeholder — returns `{ isLoading: false, error: null }` only |
| `AdminPanel.tsx` | Setup nav cards + `FinanceHealthCard` (Grow test) — no metrics |
| `get_finance_summary` RPC | ✅ `20260625000200` — reuse via `FinanceSummaryService` |
| `FinanceHub.tsx` | ✅ Full finance metrics — **do not duplicate**; link from overview |
| Routes | `/admin/setup`, `/dashboard/admin` → `AdminDashboard` → `AdminPanel` |

---

## Locked semantics

| Metric | Definition |
| --- | --- |
| **Today's classes** | Active-season offerings where `day_of_week = EXTRACT(DOW FROM CURRENT_DATE)` (Postgres DOW: 0=Sun … 6=Sat) and `status IN ('active', 'full')`, ordered by `start_time` |
| **Enrolled count** | Engagements for that offering + active season with `status IN ('active', 'pending_payment', 'pending_waiver', 'admin_review')` |
| **Waitlist count** | Rows in `waitlist` for that `offering_id` |
| **Occupancy** | `enrolled_count / max_capacity` (cap at 100% display) |
| **Enrolments this term** | Count engagements in **active season** with non-terminal status (`NOT IN ('cancelled', 'withdrawn')`) |
| **Revenue this month** | `get_finance_summary(first_of_month, today).net_revenue_minor` |
| **Outstanding payments** | Same RPC field `outstanding_engagements` (active season pending_payment) |
| **Admin review queue** | Count engagements `status = 'admin_review'` in active season |

Timezone: use **tenant-local “today”** if `tenants.timezone` exists; else `CURRENT_DATE` at DB (document in RPC comment). Check `tenants` columns before coding — if no timezone column, use `CURRENT_DATE` for V1.

---

## Hard rules

1. **New migration only:** `supabase/migrations/20260626000300_admin_dashboard_overview_rpc.sql` (verify `ls supabase/migrations/` — bump if taken).
2. **SECURITY DEFINER RPC** with same auth pattern as `get_finance_summary` (`tenant_admin` / `super_admin`, `get_my_tenant_id()`).
3. **Do not** duplicate finance P&L UI — overview shows **summary cards + links** to `/admin/finance`.
4. Reuse `FinanceSummaryService.getSummary` on the client **or** embed finance slice inside the overview RPC — pick **one** call from the hook (prefer single RPC returning JSONB to avoid waterfall).
5. Run `pnpm db:types` after migration; extend `@shared/schemas` with `AdminDashboardOverviewSchema`.
6. i18n: add keys under `pages.admin.overview.*` in `en.json` and `he.json`.
7. **No git commit/push** unless user explicitly asks.

---

## Pre-flight (agent MUST read)

1. `supabase/migrations/20260625000200_finance_summary_rpc.sql` — auth + date range pattern
2. `apps/web/src/features/finance-admin/services/financeSummaryService.ts` — client RPC usage
3. `apps/web/src/components/Dashboard/AdminPanel.tsx` — where to mount overview sections
4. `apps/web/src/components/Dashboard/useAdminDashboard.ts` — replace placeholder
5. `supabase/migrations/20260608001300_engagements.sql` — engagement statuses, `waitlist` table
6. `supabase/migrations/20260608000500_offerings.sql` — `day_of_week`, `max_capacity`, `season_id`

---

## Step 1 — Migration: `get_admin_dashboard_overview`

**File:** `supabase/migrations/20260626000300_admin_dashboard_overview_rpc.sql`

```sql
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- Auth: same as get_finance_summary
-- Resolve v_tenant_id, v_season_id (active season)
-- Compute v_today_dow := EXTRACT(DOW FROM CURRENT_DATE)::int
-- today_classes: jsonb_agg of offerings matching day_of_week + season
--   each: id, name, start_time, end_time, location, max_capacity,
--         enrolled_count, waitlist_count, staff_name (left join staff)
-- term_enrolments_count: count engagements for season (non-terminal)
-- admin_review_count, pending_payment_count (season scoped)
-- finance: call same subqueries as get_finance_summary for month-to-date
-- RETURN jsonb_build_object(...)
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_overview() TO authenticated;
```

**Active engagement statuses for occupancy** (locked):

```sql
status IN ('active', 'pending_payment', 'pending_waiver', 'admin_review', 'pending_offer')
```

**Index note:** existing indexes on `engagements(offering_id)`, `waitlist(offering_id)` — no new indexes required for V1.

---

## Step 2 — Shared schema

**File:** `packages/shared/src/schemas.ts`

Add:

```typescript
export const AdminDashboardTodayClassSchema = z.object({
  id: UUIDSchema,
  name: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  location: z.string().nullable().optional(),
  max_capacity: z.number().int().positive(),
  enrolled_count: z.number().int().nonnegative(),
  waitlist_count: z.number().int().nonnegative(),
  staff_name: z.string().nullable().optional(),
});

export const AdminDashboardOverviewSchema = z.object({
  season_id: UUIDSchema.nullable(),
  season_name: z.string().nullable(),
  today_classes: z.array(AdminDashboardTodayClassSchema),
  term_enrolments_count: z.number().int().nonnegative(),
  admin_review_count: z.number().int().nonnegative(),
  pending_payment_count: z.number().int().nonnegative(),
  finance: FinanceSummarySchema, // month-to-date
});
```

Run: `pnpm -C packages/shared build`

---

## Step 3 — Service + hook

**New:** `apps/web/src/features/admin-dashboard/services/adminDashboardService.ts`

- `AdminDashboardService.getOverview(tenant)` → `supabase.rpc('get_admin_dashboard_overview')` → parse with `AdminDashboardOverviewSchema`
- Extend `BaseService.withRetry` pattern from `FinanceSummaryService`

**Replace:** `apps/web/src/components/Dashboard/useAdminDashboard.ts`

- `useQuery` with key `['admin-dashboard-overview', tenant?.id]`
- Return `{ overview, isLoading, error, refetch }`
- Compute month boundaries in hook (first of month → today ISO dates) if finance stays separate; if embedded in RPC, pass nothing

---

## Step 4 — UI components

**New:** `apps/web/src/features/admin-dashboard/components/AdminOverviewSection.tsx`

Sections (responsive grid):

1. **Stat cards** (4-up on md+):
   - Term enrolments → link `/admin/students`
   - Outstanding payments → link `/admin/finance`
   - Admin review queue → link `/admin/students?status=admin_review` (or plain students if filter not built — link students only)
   - Revenue MTD → link `/admin/finance`

2. **Today's classes** table/list:
   - Columns: time, name, location, occupancy bar (`enrolled_count/max_capacity`), waitlist badge if > 0
   - Row click → `/admin/students?class={offeringId}`
   - Empty state: `t('pages.admin.overview.no_classes_today')`

3. **Quick actions** (button row):
   - Manage classes → `/admin/setup/classes`
   - Record payment / finance → `/admin/finance`
   - Send notification → `/admin/notifications` (stub link OK until blast plan ships — use `#` or omit if route missing)

**Modify:** `apps/web/src/components/Dashboard/AdminPanel.tsx`

- Import and render `<AdminOverviewSection />` **above** setup cards
- Keep `FinanceHealthCard` below overview or in a sidebar — do not remove Grow health check

Use existing `Button`, card border styles from setup cards. Occupancy bar: simple `div` with width `%` — no chart library.

---

## Step 5 — i18n

**Files:** `apps/web/src/i18n/en.json`, `he.json`

Keys (minimum):

```
pages.admin.overview.title
pages.admin.overview.term_enrolments
pages.admin.overview.outstanding_payments
pages.admin.overview.admin_review_queue
pages.admin.overview.revenue_mtd
pages.admin.overview.todays_classes
pages.admin.overview.no_classes_today
pages.admin.overview.enrolled_of_capacity  // "{{enrolled}} / {{capacity}}"
pages.admin.overview.waitlist_count        // "{{count}} waiting"
pages.admin.overview.quick_actions
```

---

## Step 6 — Tests

**New:** `apps/web/src/__tests__/adminDashboardOverview.test.ts`

- Parse fixture JSON with `AdminDashboardOverviewSchema`
- Occupancy percentage helper if extracted (optional)

**Manual smoke:**

1. Log in as `tenant_admin` with active season + offerings on today's DOW
2. `/admin/setup` shows stat cards and today's class list
3. Click class row → students list filtered (if query param supported)
4. Verify counts match Supabase SQL spot-check

---

## Definition of done

- [ ] Migration applied; `get_admin_dashboard_overview` granted to `authenticated`
- [ ] `useAdminDashboard` fetches real data; loading/error states work
- [ ] Overview visible on both admin dashboard routes
- [ ] Finance numbers match finance hub for same month
- [ ] i18n EN + HE
- [ ] Schema test passes; `pnpm -C apps/web test` green for new test
- [ ] Update `docs/IMPLEMENTATION_STATUS.md` row for admin overview

---

## Out of scope / follow-ups

- Dedicated `/admin` route (optional later — nav currently uses `/admin/setup`)
- Teacher payroll on overview (SPEC mentions it — defer until [V2.11 teachers admin](teachers-admin-module.md))
- CSV export from overview
- Real-time refresh / websockets
