# Phase 1G — Parent portal polish (paste into new agent chat)

**Status:** ✅ **Shipped** (2026-06-30) on branch `feat/parent-portal-polish` — commit `fcad476`. Follow-ups documented: **Step 7** (1G-b `notify_*`), **Step 8** (WhatsApp OTP verify). V1 shipped hint-only for WhatsApp.

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

**Deferred (not in this PR):** [Step 7](#step-7--optional-phase-1g-b-notify_-toggles) — `notify_*` scope toggles (1G-b); [Step 8](#step-8--whatsapp-otp-verify-in-portal-deferred) — full `WhatsAppOtpVerifier` i18n + embed.

---

## Locked semantics (V1)

| Feature | Behavior |
| --- | --- |
| **Settings entry** | Outline button *"Notification preferences"* in portal header (beside "Register for a class") → opens `ContactPreferencesEditor` modal |
| **Editable fields** | `email_opted_in`, `whatsapp_opted_in`, `whatsapp_number` (E.164 when opted in), `preferred_channel` ∈ `email` \| `whatsapp` only — hide `voice` in UI |
| **WhatsApp verify** | While modal is open, if `whatsapp_opted_in && !preferences?.whatsapp_verified` → show **inline hint** below WhatsApp fields (i18n). **Keep** close-on-save behavior unchanged. Do **not** embed `WhatsAppOtpVerifier` |
| **Upcoming sessions** | Weekly next occurrence per enrolment; **horizon** = local calendar dates **today through today + 6** (7 dates inclusive); `occursAt >= fromDate`; statuses `active`, `pending_payment`, `pending_waiver`; requires `day_of_week` + `start_time` |
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

**Files:** `apps/web/src/i18n/en.json`, `he.json` — nest under `pages.portal.preferences` (same shape as other `pages.portal.*` keys).

**Hebrew:** copy literal strings from existing `/* HE: ... */` comments in `ContactPreferencesEditor.tsx` for each field; translate new keys (`verify_whatsapp_hint`, upcoming section) to natural Hebrew.

---

## Step 2 — Mount preferences in portal

**Modify:** `apps/web/src/components/Dashboard/ParentPortal.tsx`

```tsx
import { ContactPreferencesEditor } from '@/components/shared/ContactPreferencesEditor';

const [prefsOpen, setPrefsOpen] = useState(false);

// Replace single header button with a flex group (section already has flex-wrap):
<div className="flex flex-wrap gap-2">
  <Button variant="outline" onClick={() => setPrefsOpen(true)}>
    {t('pages.portal.notification_preferences')}
  </Button>
  <Button variant="primary" onClick={() => navigate('/enrol')}>
    {t('pages.portal.enrol_new')}
  </Button>
</div>

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
import type { EngagementWithOffering } from '@/components/Dashboard/useParentPortal';

export interface UpcomingSessionOccurrence {
  engagementId: string;
  personId: string;
  personName: string;
  className: string;
  occursAt: Date;         // local datetime of next occurrence
  classLocation?: string | null;
}

export const UPCOMING_SESSION_STATUSES = ['active', 'pending_payment', 'pending_waiver'] as const;

/** Next weekly occurrence on/after fromDate; null if local calendar date falls outside horizon. */
export function nextOccurrenceOnOrAfter(
  classDay: number,
  startTime: string,
  fromDate: Date,
  horizonDays: number = 7,
): Date | null;

/** Flatten enrolmentsByPerson → filter → map → sort by occursAt ascending. */
export function buildUpcomingSessions(
  enrolmentsByPerson: Record<string, EngagementWithOffering[]>,
  personNames: Record<string, string>,
  options?: { fromDate?: Date; horizonDays?: number },
): UpcomingSessionOccurrence[];
```

**Rules:**

- `startOfToday` = local midnight of `fromDate`'s calendar day.
- `horizonLastDate` = `startOfToday + (horizonDays - 1)` calendar days (default **7 dates**: today … today+6).
- Parse `startTime` (`HH:MM` or `HH:MM:SS`) as **local** time on the occurrence date.
- Find next weekly match: if today is `classDay` and `classStartTime >= fromDate` (same local time) → today; else next matching DOW.
- Include iff occurrence local date ∈ `[startOfToday, horizonLastDate]` **and** `occursAt >= fromDate`.
- Filter `status ∈ UPCOMING_SESSION_STATUSES`; skip rows missing `classDay` or `classStartTime`.
- One row per enrolment (`engagement.id`); sort ascending by `occursAt`.

**Map from `EngagementWithOffering`:** `id` → `engagementId`, `person_id` → `personId`, `personNames[person_id]` → `personName`, `className`, `classDay`, `classStartTime`, `classLocation`, `status`.

**New tests:** `apps/web/src/__tests__/upcomingSessions.test.ts`

Cases:

1. Today is class day, time later today → included  
2. Today is class day, time already passed → next week's same weekday **excluded** (falls on day 7, outside today…today+6)  
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

- Build `personNames` in `useMemo`:

```typescript
const personNames = useMemo(() => {
  const names: Record<string, string> = {};
  for (const child of children ?? []) names[child.id] = child.name;
  if (guardian) names[guardian.personId] = guardian.name;
  return names;
}, [children, guardian]);
```

- `useMemo(() => buildUpcomingSessions(enrolmentsByPerson ?? {}, personNames), [...])`
- Insert `<UpcomingSessionsSection sessions={upcomingSessions} />` **after** children/Myself block, **before** payments
- Show `personName` on each row only when `Object.keys(personNames).length > 1`

**i18n keys:**

```
pages.portal.upcoming_heading
pages.portal.no_upcoming
pages.portal.upcoming_on_date   // "{{date}} · {{time}} · {{className}}"
pages.portal.upcoming_for       // "{{personName}}"
```

---

## Step 5 — WhatsApp verify hint (minimal)

**In `ContactPreferencesEditor` only — do not change close-on-save:**

Keep existing `onSuccess: () => { onOpenChange(false); form.reset(); }`.

Show hint **while modal is open** (not after save):

```tsx
const showVerifyHint =
  whatsappOptedIn && preferences?.whatsapp_verified === false;

{showVerifyHint && (
  <p className="text-sm text-muted-foreground" role="status">
    {t('pages.portal.preferences.verify_whatsapp_hint')}
  </p>
)}
```

Place below WhatsApp number / preferred-channel block, above Cancel/Save.

**Do not** wire `WhatsAppOtpVerifier` — separate PR for full OTP i18n.

---

## Step 6 — Tests + manual smoke

**Unit:**

```bash
pnpm -C apps/web test upcomingSessions.test.ts
pnpm -C apps/web test parent-portal-guardian.test.ts   # regression
```

**Regtest (build + lint + a11y e2e):** ✅ passed 2026-06-30.

**Manual (recommended before prod):** ⏳ not formally signed off — run checklist below on `/dashboard/portal` and `/dashboard/student`.

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

## Step 8 — WhatsApp OTP verify in portal (deferred)

**Status:** ⏸️ **Deferred** — V1 shipped **inline hint only** in `ContactPreferencesEditor` (Step 5). Full self-service verify is a follow-up PR.

**Goal:** Parent verifies WhatsApp from the notification preferences modal; `contact_preferences.whatsapp_verified` flips to `true` without studio manual step.

**Pre-flight (agent MUST read):**

1. `apps/web/src/components/shared/WhatsAppOtpVerifier.tsx` — built, **hardcoded EN**, WhatsApp send path stubbed (`// WhatsApp OTP send is wired in a later phase`)
2. `apps/web/src/components/shared/ContactPreferencesEditor.tsx` — hint at `pages.portal.preferences.verify_whatsapp_hint`
3. `apps/web/src/features/notifications/hooks/useSendOtpEmail.ts`, `useVerifyWhatsAppOtp.ts`
4. Edge: `verify-whatsapp-otp`, `send-otp-email` (email fallback already used in verifier)
5. `supabase/migrations/20260608000400_contact_prefs.sql` — `whatsapp_verified` column (no migration needed)

**Follow-up PR checklist:**

1. **i18n** — move all `WhatsAppOtpVerifier` strings to `pages.portal.preferences.verify_*` (EN + HE); reuse existing `whatsapp_verified` badge keys where possible
2. **Embed** — in `ContactPreferencesEditor`, when `whatsapp_opted_in && !preferences?.whatsapp_verified`, render `<WhatsAppOtpVerifier />` below WhatsApp fields (replace studio-contact hint, or show hint only until number saved)
3. **WhatsApp send** — wire real send in `handleSendOtp` (likely `send-otp-sms` edge or Twilio path used elsewhere); remove client-side `generateOtpCode()` for production path
4. **Forms** — apply `bindFormSubmit` to verifier forms (same pattern as prefs modal)
5. **Cache** — on `onVerificationSuccess`, refetch/update contact prefs (`useContactPreferences` / `setQueryData`) so verified badge appears without full page reload
6. **UX** — keep email fallback tab; disable “preferred channel WhatsApp” until verified (already partially enforced in editor)
7. **Tests** — extend `notifications.hooks.test.ts`; optional component test for embed visibility rules
8. **Manual smoke** — portal → prefs → opt in WhatsApp → save number → verify via email OTP (dev) → badge “Verified” → reload persists

**Definition of done (Step 8):**

- [ ] `WhatsAppOtpVerifier` fully i18n (EN + HE)
- [ ] Embedded in portal prefs modal with correct show/hide rules
- [ ] WhatsApp and/or email OTP send + verify updates `whatsapp_verified`
- [ ] Portal manual smoke passes (see Step 6 + item 8 above)

**No SQL migration** in this slice.

---

## Definition of done

- [x] `ContactPreferencesEditor` fully i18n (EN + HE) + verify hint when opted in and unverified
- [x] Preferences button + modal on `/dashboard/portal` (and works on `/dashboard/student`)
- [x] `UpcomingSessionsSection` with `buildUpcomingSessions` + tests
- [x] `EnrolmentRow` uses dynamic `returnTo`
- [x] `pnpm -C apps/web test` green for new + existing portal tests
- [x] Update `docs/IMPLEMENTATION_STATUS.md` — parent portal polish → ✅ (1G-b deferred)

### Also shipped on this branch (beyond original plan)

- [x] `SetPasswordDialog` + portal header “Login password” (Supabase `updateUser` password)
- [x] `bindFormSubmit` + form fixes (`ContactPreferencesEditor`, `SetPasswordDialog`, `AddChildModal`, `PersonForm`; `FormField` error display)
- [x] Login vs set-password schema split (`PasswordLoginSchema` vs `NewPasswordSchema`)
- [x] Adult DOB never shown as calendar date in portal/admin read-only views (`formatPersonDateOfBirthDisplay`)

### Explicitly not done

- [ ] Step 7 — `notify_*` scope toggles (1G-b) — see Step 7
- [ ] Step 8 — `WhatsAppOtpVerifier` i18n + portal embed + wired send/verify — see Step 8

---

## File checklist

| Action | Path | Status |
| --- | --- | --- |
| Edit | `ContactPreferencesEditor.tsx` | ✅ |
| Edit | `ParentPortal.tsx` | ✅ |
| Edit | `EnrolmentRow.tsx` | ✅ |
| Edit | `GuardianSelfSection.tsx` | ✅ (adult DOB display) |
| New | `features/enrolment/lib/upcomingSessions.ts` | ✅ |
| New | `components/Dashboard/UpcomingSessionsSection.tsx` | ✅ |
| New | `__tests__/upcomingSessions.test.ts` | ✅ |
| Edit | `i18n/en.json`, `i18n/he.json` | ✅ |
| Edit | `docs/IMPLEMENTATION_STATUS.md` | ✅ (sync 2026-06-30) |
| New | `lib/bindFormSubmit.ts` | ✅ |
| New | `__tests__/bindFormSubmit.test.ts` | ✅ |
| New | `components/shared/SetPasswordDialog.tsx` | ✅ |
| New | `features/auth/setLoginPassword.ts`, `sessionAuthMethod.ts` | ✅ |
| Edit | `lib/personAge.ts` (`formatPersonDateOfBirthDisplay`) | ✅ |
| Edit | `PersonDetail.tsx`, `StudentSlideOver.tsx`, `AgeReviewAdminPanel.tsx` | ✅ (adult DOB) |
| Edit | `useContactPreferences.ts`, `useParentPortal.ts` | ✅ |
| Edit | `components/ui/form.tsx` (`FormField` fieldState) | ✅ |
| Edit | `packages/shared/src/schemas.ts` (login password schema) | ✅ |

---

## Out of scope

- Invoice download changes (payments table already has links)
- Parent self-service withdrawal (Unenrol Phase 3) — [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) §6.x #7
- Notification blast composer — [notification-blast-composer.md](notification-blast-composer.md)

**Deferred follow-ups (documented in this plan):** Step 7 (`notify_*`), Step 8 (WhatsApp OTP verify).
