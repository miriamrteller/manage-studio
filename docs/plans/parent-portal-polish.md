# Phase 1G — Parent portal polish (paste into new agent chat)

## Mission

Wire **account settings** into the parent/student portal: contact preferences (`ContactPreferencesEditor`), upcoming sessions summary, and i18n polish. Adult student portal reuses the same components via `PortalDashboard`.

**Repo:** `manage-studio`  
**SPEC:** §Phase 1G — contact preference management, dashboard with enrolled children + upcoming classes  
**Depends on:** `ContactPreferencesEditor` ✅ (built, not mounted) · `useContactPreferences` ✅ · `ParentPortal` ✅ (children + payments)  
**Out of scope:** Parent withdrawal requests (Unenrol Phase 3), new enrolment flow changes, student/parent route differentiation beyond copy

---

## Current state (verified 2026-06-25)

| Item | Status |
| --- | --- |
| `ParentPortal.tsx` | Children, enrolments, payments, add/edit child, enrol CTA |
| `ContactPreferencesEditor.tsx` | Full modal — **hardcoded EN strings**, not used in portal |
| `useContactPreferences` | Works via RLS; creates row if missing |
| `ContactPreferencesSchema` (shared) | **Missing** DB columns: `notify_*` toggles |
| `ContactPreferencesUpdateSchema` | Only email/whatsapp channel fields |
| Upcoming sessions | Enrolments show day/time but **no "this week" aggregation** |
| WhatsApp OTP verify | Edge function exists; editor does not trigger verify flow |

---

## Locked semantics (V1 slice)

| Feature | Behavior |
| --- | --- |
| Settings entry | Button *"Notification preferences"* in portal header → opens `ContactPreferencesEditor` |
| Editable fields V1 | `email_opted_in`, `whatsapp_opted_in`, `whatsapp_number`, `preferred_channel` (email/whatsapp only in form — voice hidden) |
| Notification scope V1 | **Defer** `notify_*` toggles unless schema extended in this PR — document as Phase 1G-b |
| Upcoming classes | Section listing **next 7 days** of sessions from active enrolments (`active`, `pending_payment`, `pending_waiver`) using offering `day_of_week` + `start_time` |
| Adult student | Same portal route `/dashboard/student` — hide "children" section when user has no dependent people; show self enrolments (verify `useParentPortal` returns adult's own `people` row) |
| i18n | Move all `ContactPreferencesEditor` strings to `pages.portal.preferences.*` |

---

## Hard rules

1. **No new migration** unless extending `ContactPreferencesUpdateSchema` for `notify_*` fields (optional Step 7).
2. Reuse existing `ContactPreferencesEditor` — extend props/i18n, do not fork a second editor.
3. Portal changes only in `ParentPortal.tsx` + small extracted components — keep page thin.
4. Do not break enrolment highlight / pay link flows already in portal.
5. **No git commit/push** unless user explicitly asks.

---

## Pre-flight (agent MUST read)

1. `apps/web/src/components/Dashboard/ParentPortal.tsx`
2. `apps/web/src/components/Dashboard/useParentPortal.ts`
3. `apps/web/src/components/shared/ContactPreferencesEditor.tsx`
4. `apps/web/src/features/notifications/hooks/useContactPreferences.ts`
5. `packages/shared/src/schemas.ts` — `ContactPreferencesSchema`, `ContactPreferencesUpdateSchema`
6. `apps/web/src/router.tsx` — ParentRoute vs StudentRoute

---

## Step 1 — i18n for ContactPreferencesEditor

**Modify:** `ContactPreferencesEditor.tsx`

- Replace hardcoded EN with `useTranslation()` keys
- Keys under `pages.portal.preferences.*`:

```
title, description, email_opted_in, whatsapp_opted_in, whatsapp_number,
whatsapp_number_hint, preferred_channel, save, cancel
```

**Files:** `apps/web/src/i18n/en.json`, `he.json`

---

## Step 2 — Mount editor in portal

**Modify:** `ParentPortal.tsx`

```tsx
const [prefsOpen, setPrefsOpen] = useState(false);

// In header actions (next to "Enrol new"):
<Button variant="outline" onClick={() => setPrefsOpen(true)}>
  {t('pages.portal.notification_preferences')}
</Button>

<ContactPreferencesEditor open={prefsOpen} onOpenChange={setPrefsOpen} />
```

Add portal i18n key: `pages.portal.notification_preferences`

---

## Step 3 — Upcoming sessions component

**New:** `apps/web/src/components/Dashboard/UpcomingSessionsSection.tsx`

**Input:** `enrolmentsByPerson`, `children` (or flat list of `EngagementWithOffering`)

**Logic:**

```typescript
// For each enrolment with classDay != null && classStartTime:
// Map day_of_week to next occurrence within 7 days from today (local timezone)
// Sort by datetime ascending
// Display: date label, class name, time, location, child name (if parent view)
```

**Helper:** `apps/web/src/features/enrolment/lib/upcomingSessions.ts`

- Pure functions + unit tests (no DB)
- Handle DOW wrap (e.g. today Thu, class Mon → next Mon)

**Render:** Section between children and payments in `ParentPortal.tsx`

i18n: `pages.portal.upcoming_heading`, `pages.portal.no_upcoming`, `pages.portal.upcoming_for_child`

---

## Step 4 — Adult student view

**Audit:** `useParentPortal` — confirm adult student with `people.user_profile_id = auth.uid` sees their enrolments.

If children list empty but user has self person row:

- Show single **"My enrolments"** card (reuse enrolment row UI)
- Hide "Add child" when role is `student` or `adult_student` (check `useCurrentUser`)

**Modify:** `ParentPortal.tsx` with role-aware conditionals via `useCurrentUser().user.role`

i18n: `pages.portal.my_enrolments_heading`

---

## Step 5 — WhatsApp verify (minimal)

If `whatsapp_opted_in` toggled on and number changed:

- Show inline hint: *"Save preferences, then verify"* OR call existing verify flow if `verify-whatsapp-otp` is wired elsewhere

**Audit first:** grep `verify-whatsapp-otp` in web app. If no UI exists, add TODO banner only — do not block ship on OTP UI.

---

## Step 6 — Tests

**New:** `apps/web/src/__tests__/upcomingSessions.test.ts`

- Next occurrence calculation edge cases (today is class day, week wrap)

**Manual smoke:**

1. Parent portal → open preferences → toggle email opt-out → save → reload persists
2. Upcoming section shows classes in next 7 days
3. Hebrew locale renders RTL form labels

---

## Step 7 — Optional: notification scope toggles (Phase 1G-b)

If requested in same PR:

1. Extend `ContactPreferencesSchema` + `ContactPreferencesUpdateSchema` with:

```typescript
notify_offering_cancellation: z.boolean().optional(),
notify_payment_due: z.boolean().optional(),
notify_waitlist: z.boolean().optional(),
notify_schedule_change: z.boolean().optional(),
notify_announcements: z.boolean().optional(),
```

2. Add checkboxes to editor (grouped "What we notify you about")
3. No migration needed — columns exist in DB

---

## Definition of done

- [ ] Preferences modal reachable from portal; fully i18n
- [ ] Upcoming sessions section with tests
- [ ] Adult student view does not show empty children UX incorrectly
- [ ] `pnpm -C apps/web test` passes
- [ ] Update `docs/IMPLEMENTATION_STATUS.md`

---

## Out of scope

- Invoice download changes (already in payments table)
- Parent self-service withdrawal
- Portal theming / branding beyond existing tenant colors
