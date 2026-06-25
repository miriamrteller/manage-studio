# Teachers admin module (paste into new agent chat)

## Mission

Add **`/admin/setup/teachers`** CRUD page for the `staff` table. Service layer exists (`TeacherService`, `useTeachers`); only admin UI, routing, nav, and schema alignment are missing.

**Repo:** `manage-studio`  
**SPEC:** Implicit in offerings (`staff_id` FK) and Phase 1F people/operations — no dedicated SPEC screen name  
**Depends on:** `staff` table ✅ · `TeacherService` ✅ · `useTeachers` ✅  
**Out of scope:** Teacher login role, payroll runs, linking `user_profile_id` to auth users (optional field in form)

---

## Current state (verified 2026-06-25)

| Item | Status |
| --- | --- |
| `staff` table | ✅ `20260608000500_offerings.sql` |
| `TeacherService` / `useTeachers` | ✅ CRUD via `TenantDB` |
| `StaffSchema` | ⚠️ **Drift:** Zod uses `contract_type: employee \| contractor`; DB CHECK is `hourly \| salary \| freelance` |
| Admin page | ❌ |
| Nav / route | ❌ |
| Offerings admin | Can assign `staff_id` only if staff rows exist — no UI to create them |

---

## Locked semantics

| Field | V1 behavior |
| --- | --- |
| `name` | Required |
| `email`, `phone` | Optional |
| `contract_type` | **Align to DB:** `hourly`, `salary`, `freelance` (fix shared schema) |
| `hourly_rate_minor` | Optional; show when `contract_type = 'hourly'` |
| `user_profile_id` | Hidden in V1 OR optional advanced UUID field — do not require login link |
| Delete | Soft-block if offerings reference `staff_id` — show error from FK or pre-check count |

---

## Hard rules

1. **Fix `StaffSchema` first** in `packages/shared/src/schemas.ts` — match DB CHECK exactly.
2. Update `TeacherInputSchema` in `service.ts` to same enum.
3. Run `pnpm -C packages/shared build` before web changes.
4. Follow **LevelsList** pattern for list + modal form (`apps/web/src/features/levels/components/LevelsList.tsx`).
5. Route: `/admin/setup/teachers` under AdminRoute (setup section).
6. **No migration** unless RLS gap found — verify policies on `staff` allow tenant_admin CRUD.
7. **No git commit/push** unless user explicitly asks.

---

## Pre-flight (agent MUST read)

1. `supabase/migrations/20260608000500_offerings.sql` — `staff` DDL + RLS
2. `apps/web/src/features/teachers/service.ts`
3. `apps/web/src/features/teachers/hooks/useTeachers.ts`
4. `apps/web/src/features/levels/components/LevelsList.tsx` + `LevelForm.tsx`
5. `apps/web/src/components/Navigation/navigationConfig.ts`
6. Grep offerings admin for `staff_id` assignment — ensure dropdown can consume `useTeachers`

---

## Step 1 — Fix shared schema drift

**File:** `packages/shared/src/schemas.ts`

```typescript
contract_type: z.enum(['hourly', 'salary', 'freelance']).default('hourly'),
```

**File:** `apps/web/src/features/teachers/service.ts` — sync `TeacherInputSchema`

Add regression test in `apps/web/src/__tests__/staff-schema.test.ts` parsing sample DB row.

---

## Step 2 — Feature UI

**New directory:** `apps/web/src/features/teachers/components/`

| File | Purpose |
| --- | --- |
| `TeachersList.tsx` | Table, search, add/edit/delete (mirror LevelsList) |
| `TeacherForm.tsx` | Dialog form: name, email, phone, contract_type, hourly_rate_minor |

**Hooks:** reuse `useTeachers` — extend with search if needed (client filter OK for ≤50 rows).

**Delete guard:**

```typescript
// Before delete: count offerings where staff_id = id
// If > 0: toast error t('pages.teachers.delete_blocked_in_use')
```

Use `TenantDB.selectFor('offerings', tenant).eq('staff_id', id).limit(1)` in service method `TeacherService.canDelete`.

---

## Step 3 — Page + routing

**New:** `apps/web/src/pages/TeachersPage.tsx`

```tsx
export default function TeachersPage() {
  return <TeachersList />;
}
```

**Modify:** `apps/web/src/router.tsx`

```tsx
{ path: 'admin/setup/teachers', element: <AdminRoute><TeachersPage /></AdminRoute> },
```

**Modify:** `navigationConfig.ts` — setup section, after classes:

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

## Step 4 — Admin setup hub card (optional)

**Modify:** `AdminPanel.tsx` — add card linking to teachers (if not redundant with nav). Skip if nav-only is enough.

---

## Step 5 — Offerings integration (small)

**Audit:** class form component for teacher dropdown.

If missing: add optional `staff_id` select populated from `useTeachers().teachers` in class create/edit form (`AdminClassesPage` feature). **Separate commit within same PR OK.**

---

## Step 6 — i18n

**Keys:** `pages.teachers.*`, `nav.teachers`, form labels, contract type labels:

```
contract_hourly, contract_salary, contract_freelance
delete_blocked_in_use, empty_title, description
```

EN + HE in `en.json` / `he.json`.

---

## Step 7 — Tests + manual smoke

**Unit:** StaffSchema parse test with DB-shaped row

**Manual:**

1. Create teacher → appears in list
2. Assign to offering in class admin → saves
3. Delete teacher with offering → blocked with message
4. Delete unused teacher → succeeds

---

## Definition of done

- [ ] Schema drift fixed; shared package rebuilt
- [ ] `/admin/setup/teachers` CRUD works
- [ ] Nav entry visible to tenant_admin
- [ ] i18n EN + HE
- [ ] Update `docs/IMPLEMENTATION_STATUS.md`

---

## Out of scope

- `teacher` role portal / session
- Payroll calculation using `hourly_rate_minor`
- Invite-by-email to link `user_profile_id`
