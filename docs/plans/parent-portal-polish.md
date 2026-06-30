# Phase 1G — Parent portal polish (paste into new agent chat)

## Mission

Complete the **parent/student portal** account settings slice: mount **notification preferences**, add **upcoming sessions (7 days)**, i18n, and small portal UX fixes. Reuses existing hooks/components — no new migrations in V1 slice.

**Repo:** `manage-studio`  
**SPEC:** §Phase 1G — contact preference management; dashboard with enrolled children + upcoming classes  
**Branch:** branch from `main` (or continue after merging `feat/icount-integration` — **no payment work in this PR**)  
**Depends on:** `ContactPreferencesEditor` ✅ · `useContactPreferences` ✅ · `ParentPortal` ✅ · parent self-enrolment P1–P3 ✅ ([parent-self-enrolment/00-overview.md](parent-self-enrolment/00-overview.md))  
**Out of scope:** WhatsApp OTP full flow i18n, `notify_*` scope toggles (optional 1G-b), parent withdrawal, portal theming

---

## Current state (verified 2026-06-29)

| Item | Status |
| --- | --- |
| `ParentPortal.tsx` | Children, **Myself** (`GuardianSelfSection`), payments, enrol CTA, highlight scroll |
| `useParentPortal.ts` | Guardian + children + `enrolmentsByPerson` + payments |
| `ContactPreferencesEditor.tsx` | Built — **hardcoded EN**, not mounted in portal |
| `WhatsAppOtpVerifier.tsx` | Built — hardcoded EN; **not wired** (V1: hint only) |
| `useContactPreferences` | RLS-backed read/update; creates row if missing |
| Upcoming sessions | ❌ No aggregated 7-day view |
| `EnrolmentRow.tsx` | `returnTo` hardcoded `/dashboard/portal` — fix for `/dashboard/student` |
| Portal i18n | `pages.portal.*` exists; **no** `preferences.*` keys yet |

**Already shipped elsewhere — do not redo:** Myself section, guardian setup, `resolveGuardianProfile` ([parent-self-enrolment P2/P3](parent-self-enrolment/stage-p2-portal-myself.md)).

---

## Locked semantics (V1)

| Feature | Behavior |
| --- | --- |
| **Settings entry** | Outline button *"Notification preferences"* in portal header (beside "Register for a class") → opens `ContactPreferencesEditor` modal |
| **Editable fields** | `email_opted_in`, `whatsapp_opted_in`, `whatsapp_number` (E.164 when opted in), `preferred_channel` ∈ `email` \| `whatsapp` only — hide `voice` in UI |
| **WhatsApp verify** | If `whatsapp_opted_in && !whatsapp_verified` after save → show **inline hint** in modal (i18n). Do **not** embed full `WhatsAppOtpVerifier` in V1 unless trivial |
| **Upcoming sessions** | Next **7 calendar days** from local midnight today; include enrolments with `status IN ('active', 'pending_payment', 'pending_waiver')` and scheduled offering (`day_of_week` + `start_time` both set) |
| **Person label** | Show child/guardian name on each upcoming row when parent has multiple people |
| **Empty upcoming** | Section still visible with `no_upcoming` copy (not hidden) |
| **Student route** | `/dashboard/student` uses same `ParentPortal`; pay/status links use **current pathname** as `returnTo` |
| **1G-b (optional)** | `notify_*` toggles — only if explicitly requested in same PR |

---

## Hard rules

1. **No SQL migration** in V1 slice.
2. Reuse **`ContactPreferencesEditor`** — extend i18n + portal mount; do not fork a second editor.
3. Portal UI changes in `ParentPortal.tsx` + **new small components** under `components/Dashboard/` — keep `ParentPortal` readable.
4. Upcoming logic in **pure functions** (`upcomingSessions.ts`) with unit tests — no DB calls in helper.
5. Do not break portal highlight scroll, success banner, or enrolment pay links.
6. All user-facing strings in `en.json` / `he.json` — remove hardcoded EN from touched components.
7. **No git commit/push** unless user explicitly asks.

---

## Pre-flight (agent MUST read)

1. `apps/web/src/components/Dashboard/ParentPortal.tsx`
2. `apps/web/src/components/Dashboard/useParentPortal.ts`
3. `apps/web/src/components/Dashboard/EnrolmentRow.tsx`
4. `apps/web/src/components/shared/ContactPreferencesEditor.tsx`
5. `apps/web/src/features/notifications/hooks/useContactPreferences.ts`
6. `packages/shared/src/schemas.ts` — `ContactPreferencesUpdateSchema`
7. `supabase/migrations/20260608000400_contact_prefs.sql` — DB columns (reference only)
8. `apps/web/src/pages/PortalDashboard.tsx` — both parent + student routes

---

## Step 1 — i18n: ContactPreferencesEditor

**Modify:** `apps/web/src/components/shared/ContactPreferencesEditor.tsx`

- Add `useTranslation()`
- Replace all hardcoded strings + inline EN/HE comments with keys under `pages.portal.preferences.*`
- Replace `'Saving...'` / `'Save Preferences'` / WhatsApp `(disabled)` with i18n
- `useEffect`: when `open && preferences`, call `form.reset({ ... })` so modal shows loaded prefs

**Keys (minimum):**

```json
"pages.portal.preferences": {
  "title": "...",
  "description": "...",
  "email_opted_in": "...",
  "email_opted_in_desc": "...",
  "whatsapp_opted_in": "...",
  "whatsapp_opted_in_desc": "...",
  "whatsapp_number": "...",
  "whatsapp_number_hint": "...",
  "preferred_channel": "...",
  "preferred_channel_desc": "...",
  "channel_email": "...",
  "channel_whatsapp": "...",
  "channel_whatsapp_disabled": "...",
  "save": "...",
  "saving": "...",
  "cancel": "...",
  "verify_whatsapp_hint": "Save your number, then contact the studio to verify WhatsApp."
}
```

**Files:** `apps/web/src/i18n/en.json`, `he.json` — mirror structure exactly.

---

## Step 2 — Mount preferences in portal

**Modify:** `apps/web/src/components/Dashboard/ParentPortal.tsx`

```tsx
import { ContactPreferencesEditor } from '@/components/shared/ContactPreferencesEditor';

const [prefsOpen, setPrefsOpen] = useState(false);

// Header actions — flex wrap with enrol button:
<Button variant="outline" onClick={() => setPrefsOpen(true)}>
  {t('pages.portal.notification_preferences')}
</Button>
<Button variant="primary" onClick={() => navigate('/enrol')}>
  {t('pages.portal.enrol_new')}
</Button>

<ContactPreferencesEditor open={prefsOpen} onOpenChange={setPrefsOpen} />
```

Add i18n: `pages.portal.notification_preferences`

**Optional:** show `whatsapp_verified` badge in modal when `preferences?.whatsapp_verified` (read-only text).

---

## Step 2b — Student route `returnTo`

**Modify:** `apps/web/src/components/Dashboard/EnrolmentRow.tsx`

```tsx
import { useLocation } from 'react-router-dom';
// ...
const location = useLocation();
<EnrolmentStatusAction
  ...
  returnTo={location.pathname}
/>
```

Ensures `/dashboard/student` pay links return correctly.

---

## Step 3 — Upcoming sessions (pure logic)

**New:** `apps/web/src/features/enrolment/lib/upcomingSessions.ts`

```typescript
export interface UpcomingSessionInput {
  engagementId: string;
  personId: string;
  personName: string;
  className: string;
  classDay: number;       // 0=Sun … 6=Sat (Postgres DOW)
  classStartTime: string; // "HH:MM:SS" or "HH:MM"
  classLocation?: string | null;
  status: string;
}

export interface UpcomingSessionOccurrence {
  engagementId: string;
  personId: string;
  personName: string;
  className: string;
  occursAt: Date;         // local datetime of next occurrence
  classLocation?: string | null;
}

export const UPCOMING_SESSION_STATUSES = ['active', 'pending_payment', 'pending_waiver'] as const;

/** Next occurrence of classDay/startTime on or after startOfToday, within horizonDays (default 7). */
export function nextOccurrenceOnOrAfter(
  classDay: number,
  startTime: string,
  fromDate: Date,
  horizonDays: number,
): Date | null;

/** Flatten enrolmentsByPerson → filter → map → sort by occursAt ascending. */
export function buildUpcomingSessions(
  enrolmentsByPerson: Record<string, EngagementWithOffering[]>,
  personNames: Record<string, string>,
  options?: { fromDate?: Date; horizonDays?: number },
): UpcomingSessionOccurrence[];
```

**Rules:**

- Parse `startTime` as local time on the computed calendar date.
- If `classDay === fromDate.getDay()` and time ≥ now → today; else next matching DOW within horizon.
- Skip rows missing `classDay` or `classStartTime`.
- Deduplicate: same `engagementId` once (one row per enrolment).

**New tests:** `apps/web/src/__tests__/upcomingSessions.test.ts`

Cases:

1. Today is class day, time later today → included  
2. Today is class day, time already passed → next week if within 7 days, else excluded  
3. Thu today, class Mon → next Mon within horizon  
4. Status `cancelled` excluded  
5. Missing schedule excluded  

---

## Step 4 — UpcomingSessionsSection UI

**New:** `apps/web/src/components/Dashboard/UpcomingSessionsSection.tsx`

**Props:**

```typescript
interface UpcomingSessionsSectionProps {
  sessions: UpcomingSessionOccurrence[];
}
```

**Render:**

- `<section aria-labelledby="portal-upcoming-heading">`
- Heading: `t('pages.portal.upcoming_heading')`
- List: date (locale `toLocaleDateString`), time, class name, person name, location
- Empty: `t('pages.portal.no_upcoming')`
- Use existing card/border patterns from children section

**Modify:** `ParentPortal.tsx`

- `useMemo` to build `personNames` from `children` + `guardian`
- `useMemo` → `buildUpcomingSessions(enrolmentsByPerson, personNames)`
- Insert `<UpcomingSessionsSection />` **after** children/Myself block, **before** payments

**i18n keys:**

```
pages.portal.upcoming_heading
pages.portal.no_upcoming
pages.portal.upcoming_on_date   // "{{date}} · {{time}} · {{className}}"
pages.portal.upcoming_for       // "{{personName}}"
```

---

## Step 5 — WhatsApp verify (minimal)

**In `ContactPreferencesEditor` only:**

After successful save, if `data.whatsapp_opted_in && !preferences?.whatsapp_verified`:

- Show `FormDescription` or small `Alert` with `t('pages.portal.preferences.verify_whatsapp_hint')`

**Do not** wire `WhatsAppOtpVerifier` unless user expands scope — component needs its own i18n pass (separate PR).

---

## Step 6 — Tests + manual smoke

**Unit:**

```bash
pnpm -C apps/web test upcomingSessions.test.ts
pnpm -C apps/web test parent-portal-guardian.test.ts   # regression
```

**Manual:**

1. Parent `/dashboard/portal` → Notification preferences → toggle email off → save → reload → persists  
2. Upcoming section shows classes in next 7 days (seed offering with `day_of_week` matching today/tomorrow)  
3. Hebrew locale: preferences modal + upcoming section RTL labels  
4. `/dashboard/student` (if test user exists) → pay link returns to student dashboard  

---

## Step 7 — Optional Phase 1G-b: `notify_*` toggles

**Only if user requests in same PR:**

1. Extend `ContactPreferencesSchema` + `ContactPreferencesUpdateSchema` in `packages/shared/src/schemas.ts`:

```typescript
notify_offering_cancellation: z.boolean().optional(),
notify_payment_due: z.boolean().optional(),
notify_waitlist: z.boolean().optional(),
notify_schedule_change: z.boolean().optional(),
notify_announcements: z.boolean().optional(),
```

2. `pnpm -C packages/shared build`
3. Add checkbox group in editor under `pages.portal.preferences.scope_heading`
4. Columns already exist in DB — no migration

---

## Definition of done

- [ ] `ContactPreferencesEditor` fully i18n (EN + HE)
- [ ] Preferences button + modal on `/dashboard/portal` (and works on `/dashboard/student`)
- [ ] `UpcomingSessionsSection` with `buildUpcomingSessions` + tests
- [ ] `EnrolmentRow` uses dynamic `returnTo`
- [ ] `pnpm -C apps/web test` green for new + existing portal tests
- [ ] Update `docs/IMPLEMENTATION_STATUS.md` — parent portal polish → ✅ (or 🟡 if 1G-b deferred)

---

## File checklist

| Action | Path |
| --- | --- |
| Edit | `ContactPreferencesEditor.tsx` |
| Edit | `ParentPortal.tsx` |
| Edit | `EnrolmentRow.tsx` |
| New | `features/enrolment/lib/upcomingSessions.ts` |
| New | `components/Dashboard/UpcomingSessionsSection.tsx` |
| New | `__tests__/upcomingSessions.test.ts` |
| Edit | `i18n/en.json`, `i18n/he.json` |
| Edit | `docs/IMPLEMENTATION_STATUS.md` |

---

## Out of scope

- Invoice download changes (payments table already has links)
- Parent self-service withdrawal (Unenrol Phase 3)
- Full `WhatsAppOtpVerifier` i18n + portal embed
- Notification blast composer (separate plan)
