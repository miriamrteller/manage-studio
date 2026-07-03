# Teachers admin module — V2.11 (paste into new agent chat when prioritized)

**Status:** **Deferred to V2.11** — removed from V1 scope (2026-07-03). Agent plan ready; do **not** implement until V2.11 is explicitly prioritized.

**SPEC:** [SPEC.md §8 V2.11](../../SPEC.md#v211--teachers-admin-module) · §6.x item 8 cross-ref

## Mission

Add **`/admin/setup/teachers`** CRUD page for the `staff` table. Service layer exists (`TeacherService`, `useTeachers`); fix **schema drift**, add admin UI, routing, and nav. Class form **already** has `staff_id` dropdown — verify only.

**Repo:** `manage-studio`  
**SPEC:** Implicit in offerings (`staff_id` FK) and Phase 1C setup  
**Branch:** branch from `main` when **V2.11** starts — not part of V1 close-out  
**Depends on:** `staff` table ✅ · RLS `admins manage staff` ✅ · `TeacherService` ✅ · `useTeachers` ✅ · `ClassForm` staff select ✅  
**Out of scope:** Teacher login role, payroll runs, linking `user_profile_id` to auth users, AdminPanel setup card

---

## External dependencies

| Service | Required? |
| --- | --- |
| Resend / Twilio / payments | **No** |
| Migration | **No** (unless RLS gap found — none expected) |

---

## Current state (verified 2026-07-01)

| Item | Status |
| --- | --- |
| `staff` table | ✅ `hourly \| salary \| freelance`; `user_profile_id` nullable |
| `TeacherService` / `useTeachers` | ✅ CRUD |
| `StaffSchema` | ⚠️ **Drift:** `contract_type` `employee \| contractor`; `user_profile_id` required in Zod but nullable in DB |
| `TeacherInputSchema` | ⚠️ Same enum drift |
| Admin page / route / nav | ❌ |
| `ClassForm.tsx` | ✅ `staff_id` select via `useTeachers` — **no change required** |

---

## Locked semantics (V1)

| Field | Behavior |
| --- | --- |
| `name` | Required |
| `email`, `phone` | Optional; empty string → `null` on save |
| `contract_type` | **`hourly` \| `salary` \| `freelance`** (match DB); default **`hourly`** |
| `hourly_rate_minor` | Optional integer; **show only when** `contract_type === 'hourly'` |
| `user_profile_id` | **Hidden** in V1 — do not expose in form |
| **Create** | Requires `name` + `contract_type` |
| **Delete** | Block if any `offerings.staff_id = id`; show `delete_blocked_in_use` toast |
| **List** | Paginated (50), client search on name/email OK |
| **Auth** | `tenant_admin` (RLS + AdminRoute) |

---

## Hard rules

1. **Fix `StaffSchema` + `TeacherInputSchema` first** — must parse real DB rows before UI work.
2. Run `pnpm -C packages/shared build` before web changes.
3. Mirror **`LevelsList` + `LevelForm`** patterns exactly (`apps/web/src/features/levels/components/`).
4. Route: `/admin/setup/teachers` under `AdminRoute`, **setup** nav section, **after levels**.
5. **Skip** AdminPanel card (Step 4) and **skip** ClassForm changes (already wired).
6. **No git commit/push** unless user explicitly asks.

---

## Pre-flight (agent MUST read)

1. `supabase/migrations/20260608000500_offerings.sql` — `staff` DDL + RLS
2. `packages/shared/src/schemas.ts` — `StaffSchema`
3. `apps/web/src/features/teachers/service.ts` + `hooks/useTeachers.ts`
4. `apps/web/src/features/levels/components/LevelsList.tsx` + `LevelForm.tsx`
5. `apps/web/src/features/classes/components/ClassForm.tsx` — confirm `staff_id` select (read-only audit)
6. `apps/web/src/router.tsx` + `navigationConfig.ts`

---

## Step 1 — Fix shared schema drift

**Modify:** `packages/shared/src/schemas.ts`

```typescript
export const StaffSchema = z.object({
  id: UUIDSchema,
  tenant_id: UUIDSchema,
  user_profile_id: UUIDSchema.nullable().optional(),
  name: z.string().min(1, 'Teacher name required'),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  contract_type: z.enum(['hourly', 'salary', 'freelance']).default('hourly'),
  hourly_rate_minor: z.number().int().nonnegative().nullable().optional(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema.optional(),
});
```

**Modify:** `apps/web/src/features/teachers/service.ts`

```typescript
const TeacherInputSchema = z.object({
  name: z.string().min(1, 'Teacher name required'),
  email: z.string().email().nullable().optional().or(z.literal('')),
  phone: z.string().nullable().optional(),
  contract_type: z.enum(['hourly', 'salary', 'freelance']).default('hourly'),
  hourly_rate_minor: z.number().int().nonnegative().nullable().optional(),
});
```

**Add `TeacherService.canDelete`:**

```typescript
static async canDelete(tenant: Tenant, id: string): Promise<boolean> {
  const { count, error } = await TenantDB.selectFor('offerings', tenant, { count: 'exact', head: true })
    .eq('staff_id', id);
  if (error) throw error;
  return (count ?? 0) === 0;
}
```

**Update `delete`:** call `canDelete` first; if false throw `new Error('TEACHER_IN_USE')` (map to i18n in UI).

**New test:** `apps/web/src/__tests__/staff-schema.test.ts`

```typescript
const dbRow = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: '22222222-2222-4222-8222-222222222222',
  user_profile_id: null,
  name: 'Maya Cohen',
  email: 'maya@example.com',
  phone: null,
  contract_type: 'hourly',
  hourly_rate_minor: 15000,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
expect(() => StaffSchema.parse(dbRow)).not.toThrow();
```

```bash
pnpm -C packages/shared build
pnpm -C apps/web test staff-schema.test.ts
```

---

## Step 2 — Feature UI

**New:** `apps/web/src/features/teachers/components/TeacherForm.tsx`

- Dialog/modal form (mirror `LevelForm` structure)
- Fields: `name`, `email`, `phone`, `contract_type` (`<select>`), `hourly_rate_minor` (number input, visible when hourly)
- `react-hook-form` + zod resolver from `TeacherInputSchema`
- Normalize empty email to `null` on submit

**New:** `apps/web/src/features/teachers/components/TeachersList.tsx`

Copy structure from `LevelsList.tsx`:

| LevelsList | TeachersList |
| --- | --- |
| `useLevels` | `useTeachers` |
| `LevelForm` | `TeacherForm` |
| `labels.category.*` | `pages.teachers.*` |
| Sort by name (default) | Sort by `name` ascending (service already orders) |

**Table columns:** Name, Email, Phone, Contract type (i18n label), Hourly rate (formatted money or `—`), Actions (Edit / Delete)

**Delete flow:**

```typescript
const inUse = !(await TeacherService.canDelete(tenant, id));
if (inUse) {
  toast.error(t('pages.teachers.delete_blocked_in_use'));
  return;
}
// else confirm dialog → deleteTeacher
```

Use existing toast pattern from project (or `alert-error` if no toast helper).

**Export:** `apps/web/src/features/teachers/components/index.ts`

---

## Step 3 — Page + routing

**New:** `apps/web/src/pages/TeachersPage.tsx`

```tsx
import { TeachersList } from '@/features/teachers/components/TeachersList';

export default function TeachersPage() {
  return <TeachersList />;
}
```

**Modify:** `apps/web/src/router.tsx` (with other setup routes):

```tsx
{ path: 'admin/setup/teachers', element: <AdminRoute><TeachersPage /></AdminRoute> },
```

**Modify:** `navigationConfig.ts` — insert **after** `/admin/setup/levels`:

```typescript
{
  path: '/admin/setup/teachers',
  labelKey: 'nav.teachers',
  requiredRoles: ['tenant_admin'],
  sectionKey: 'setup',
  indent: true,
},
```

---

## Step 4 — ClassForm audit (verify only)

**Read:** `apps/web/src/features/classes/components/ClassForm.tsx`

Confirm `staff_id` `<select>` populated from `teachers` prop. **No code change** unless broken after schema fix. Document in PR notes: "ClassForm already supported staff assignment."

**Skip:** `AdminPanel.tsx` setup card — nav entry is sufficient.

---

## Step 5 — i18n

**Keys:** `nav.teachers`, `pages.teachers.*`

```json
"nav": { "teachers": "Teachers" },
"pages": {
  "teachers": {
    "title": "Teachers",
    "description": "Manage instructors assigned to classes.",
    "empty_title": "No teachers yet",
    "empty_message": "Add teachers to assign them when creating classes.",
    "contract_hourly": "Hourly",
    "contract_salary": "Salary",
    "contract_freelance": "Freelance",
    "hourly_rate": "Hourly rate",
    "delete_blocked_in_use": "This teacher is assigned to one or more classes and cannot be deleted.",
    "form_name": "Name",
    "form_email": "Email",
    "form_phone": "Phone",
    "form_contract_type": "Contract type"
  }
}
```

Mirror in `he.json` (natural Hebrew).

Reuse `common.add_entity`, `common.edit`, `common.delete`, `common.search` where LevelsList does.

---

## Step 6 — Tests + manual smoke

**Unit:** `staff-schema.test.ts` (Step 1)

**Manual:**

1. Create teacher → appears in list
2. Edit contract type to salary → hourly rate field hidden
3. Assign teacher on **Manage classes** → saves
4. Delete teacher assigned to class → blocked message
5. Delete unused teacher → succeeds
6. Hebrew locale on teachers page

---

## Definition of done

- [ ] `StaffSchema` parses DB-shaped rows; shared package rebuilt
- [ ] `/admin/setup/teachers` CRUD works
- [ ] Nav entry visible to `tenant_admin`
- [ ] Delete blocked when `offerings.staff_id` references teacher
- [ ] i18n EN + HE
- [ ] `staff-schema.test.ts` green
- [ ] Update `docs/IMPLEMENTATION_STATUS.md` — teachers admin V2.11 → ✅

---

## File checklist

| Action | Path |
| --- | --- |
| Edit | `packages/shared/src/schemas.ts` |
| Edit | `features/teachers/service.ts` |
| New | `features/teachers/components/TeacherForm.tsx` |
| New | `features/teachers/components/TeachersList.tsx` |
| New | `features/teachers/components/index.ts` |
| New | `pages/TeachersPage.tsx` |
| Edit | `router.tsx` |
| Edit | `navigationConfig.ts` |
| Edit | `i18n/en.json`, `he.json` |
| New | `__tests__/staff-schema.test.ts` |
| Edit | `docs/IMPLEMENTATION_STATUS.md` |

---

## Out of scope

- `teacher` role portal / login
- Payroll using `hourly_rate_minor`
- Invite-by-email to link `user_profile_id`
- AdminPanel setup hub card
- Changes to `ClassForm` (already has staff dropdown)
