# PR B — Parent age review request + admin approve/decline (paste into new agent chat)

## Mission

Let **guests and parents** request studio review when age-blocked (`admin_review` engagement). Let **admins** approve (→ `pending_payment` + email) or decline (→ `cancelled` + email). **No payment provider / checkout amount work** — reuse existing pay/completion links after approve.

**Repo:** `manage-studio`  
**SPEC:** §4.2.5 · [overview](2026-06-02-age-override-and-review-request.md)  
**Requires PR A merged first:** [PR A — harden admin override](age-override-pr-a.md) (policy module, guest age guard, `engagement_age_at_season_start` SQL helper) — ✅ complete

---

## Locked semantics (do not reinterpret)

| Flow | Actor | Status after action | Payment |
| --- | --- | --- | --- |
| Admin override | `tenant_admin` | `pending_payment` | Normal checkout (PR A) |
| Parent review **request** | guest / parent | `admin_review` | **Blocked** |
| Admin **approve** | `tenant_admin` | `pending_payment` + `age_override_*` set | Existing pay link in email |
| Admin **decline** | `tenant_admin` | `cancelled`, `cancellation_reason = 'age_review_declined'` | N/A |

- Parent note on request: **required**, min **10** chars, max 1000 (`age_review_note` column).
- Admin email deep link: `/admin/students?engagement={engagementId}` — **no magic link / auth token in email**.
- V1 notify **admins only** on submit; parent email on approve/decline only.
- Never expose admin override checkbox to guest/parent.

---

## Hard rules

1. Review creates **must** use **SECURITY DEFINER RPCs** — RLS INSERT policy only allows `status = 'pending_payment'` for parents (`20260608001300_engagements.sql`).
2. **New migration only:** `supabase/migrations/20260626000200_age_review_rpcs.sql` (verify `ls supabase/migrations/` — adjust timestamp if taken).
3. Never edit shipped `20260608*` migrations in place.
4. Audit writes go **inside RPC** (`INSERT INTO audit_log`) — match `cancel_engagement` in `20260608002300_engagement_actions.sql`. Do not rely on `BaseService.logAudit` (no-op).
5. Reject review if age **is eligible** (`RAISE EXCEPTION 'AGE_ELIGIBLE'`).
6. Reject override path on review RPCs; reject review on guest create engagement (PR A).
7. Run `pnpm email:bundle` after email template changes.
8. **No git commit/push** unless user explicitly asks.
9. **Out of scope:** WhatsApp, payment provider config, Grow, new checkout pricing, parent email on submit.

---

## Step 1 — Migration: review + approve/decline RPCs

**File:** `supabase/migrations/20260626000200_age_review_rpcs.sql`

Read first:

- `supabase/migrations/20260608002300_engagement_actions.sql` (`cancel_engagement` — auth, audit, tenant guard)
- `supabase/migrations/20260608002100_guest_enrolment_rpcs.sql` (guest patterns, billing account)
- `supabase/migrations/20260626000100_age_engagement_helpers.sql` (`engagement_age_at_season_start` — from PR A)

### 1a — SQL helper: assert age ineligible

```sql
CREATE OR REPLACE FUNCTION public.assert_age_ineligible_for_offering(
  p_person_id UUID,
  p_offering_id UUID,
  p_tenant_id UUID
)
RETURNS INT  -- returns age_at_season_start snapshot
-- Load DOB, min/max, season start; compute age
-- IF eligible OR cannot validate → RAISE EXCEPTION 'AGE_ELIGIBLE'
-- ELSE RETURN age snapshot
```

### 1b — `request_age_review_engagement`

```sql
CREATE OR REPLACE FUNCTION public.request_age_review_engagement(
  p_person_id   UUID,
  p_offering_id UUID,
  p_season_id   UUID,
  p_note        TEXT
)
RETURNS JSONB  -- { "engagementId": "..." }
```

**Auth:** `auth.uid()` required.

**Authorization:**

- Caller is `tenant_admin` for same tenant → **reject** (`RAISE EXCEPTION 'Use admin override, not review'`) — admins use override, not review.
- OR caller is account holder / adult student for `p_person_id` (mirror `assertCanCreateEngagement` logic in SQL or call existing patterns from guest RPCs).

**Validation:**

- `p_note`: trim, length 10–1000 else `RAISE EXCEPTION 'INVALID_NOTE'`.
- `assert_age_ineligible_for_offering` → snapshot age.
- No duplicate blocking engagement (same person+offering+season, status not in `cancelled`,`withdrawn`).

**Insert:**

```sql
INSERT INTO engagements (
  tenant_id, person_id, offering_id, season_id, billing_account_id,
  status, age_review_note, age_at_season_start
) VALUES (..., 'admin_review', trimmed_note, snapshot);
```

Ensure billing account (reuse logic from `guest_enrolment_create_engagement`).

**Audit:**

```sql
INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
VALUES (..., 'CREATE', 'engagements', new_id, NULL, jsonb_build_object('status','admin_review', ...));
```

**Grant:** `GRANT EXECUTE ... TO authenticated` (not anon).

### 1c — `guest_enrolment_request_age_review`

```sql
CREATE OR REPLACE FUNCTION public.guest_enrolment_request_age_review(
  p_subdomain         TEXT,
  p_student_person_id UUID,
  p_offering_id       UUID,
  p_season_id         UUID,
  p_note              TEXT
)
RETURNS JSONB
```

- Resolve tenant from subdomain (guest RPC pattern).
- Validate person belongs to tenant.
- Same note + ineligible + insert rules as 1b.
- **Grant:** `anon`, `authenticated`.

### 1d — `approve_age_review_engagement`

```sql
CREATE OR REPLACE FUNCTION public.approve_age_review_engagement(
  p_engagement_id UUID,
  p_admin_reason  TEXT DEFAULT NULL
)
RETURNS JSONB
```

- Admin/super_admin only (`cancel_engagement` auth pattern).
- Row must be `status = 'admin_review'`.
- Update:
  - `status = 'pending_payment'`
  - `age_override_at = now()`, `age_override_by = auth.uid()`, `age_override_reason = nullif(trim(p_admin_reason),'')`
- Audit log UPDATE.
- Return engagement row JSON.

### 1e — `decline_age_review_engagement`

```sql
CREATE OR REPLACE FUNCTION public.decline_age_review_engagement(
  p_engagement_id UUID,
  p_reason        TEXT DEFAULT NULL
)
RETURNS JSONB
```

- Admin/super_admin only.
- Row must be `admin_review`.
- Update: `status = 'cancelled'`, `cancelled_at = now()`, `cancelled_by = auth.uid()`, `cancellation_reason = coalesce(nullif(trim(p_reason),''), 'age_review_declined')`.
- Audit log.

Regenerate types after push: `pnpm db:types:all` · `pnpm -C packages/shared build`.

---

## Step 2 — App services

**File:** `apps/web/src/features/enrolment/intakeService.ts`

Add:

```typescript
static async requestGuestAgeReview(tenant, input: {
  studentPersonId: string;
  offeringId: string;
  seasonId: string;
  note: string;
}): Promise<{ engagementId: string }>
// RPC: guest_enrolment_request_age_review

static async requestAgeReview(tenant, input: {
  personId: string;
  offeringId: string;
  seasonId: string;
  note: string;
}): Promise<{ engagementId: string }>
// RPC: request_age_review_engagement
```

**File:** `apps/web/src/features/enrolment/lib/ageReviewService.ts` (NEW)

```typescript
export async function approveAgeReviewEngagement(engagementId: string, adminReason?: string): Promise<Engagement>
export async function declineAgeReviewEngagement(engagementId: string, reason?: string): Promise<Engagement>
// supabase.rpc wrappers + Zod parse
```

Map RPC errors: `AGE_ELIGIBLE`, `INVALID_NOTE`, `Forbidden` → i18n keys.

---

## Step 3 — Parent / guest UI

### 3a — `AgeReviewRequestForm.tsx` (NEW)

Props:

```typescript
interface AgeReviewRequestFormProps {
  studentName: string;
  className: string;
  studentAge: number | null;
  classAges: string | null;
  onSubmit: (note: string) => Promise<void>;
  onBrowseClasses: () => void;  // navigate /classes
  isSubmitting?: boolean;
  error?: string | null;
}
```

- Primary secondary button: `t('pages.enrolment.age_review_request_button')`
- Textarea: required min 10 chars client-side (Zod `z.string().trim().min(10).max(1000)`)
- On success parent shows confirmation (no checkout)

### 3b — Extend `SelectedClassAgeAlert`

**File:** `selectedClassAgeValidation.tsx`

When `blocked && actor !== 'admin'`:

- Keep existing alert text
- Render `AgeReviewRequestForm` below OR a button that expands the form
- Pass `actor` prop (from PR A)

### 3c — Wire flows

**File:** `StepSelectStudent.tsx`

- Guest `new_family` / `new_child` with pre-selected class + age blocked:
  - **Today:** Next disabled (`canBypassAgeBlock` false)
  - **After:** Show review form instead of enabling Next; on submit call intake service → show success state

**File:** `EnrolmentStepper.tsx`

- Add state: `reviewSubmitted: boolean`, `reviewEngagementId: string | null`
- When review succeeds: set flag, **do not** call checkout preparation
- Render confirmation step/message (`pages.enrolment.age_review_submitted_title` / `_body`)
- Ensure `getSelectedClassAgeError` / checkout guards also block when `reviewSubmitted`

**Authenticated parent** blocked on class step: same review form in `StepClass.tsx` or alert area (no override).

---

## Step 4 — Admin UI

### 4a — `AgeReviewAdminPanel.tsx` (NEW)

Shown when engagement `status === 'admin_review'`.

Display: student name, DOB, `age_at_season_start`, class name, age band, `age_review_note`.

Actions:

- Approve → optional admin reason → `approveAgeReviewEngagement` → trigger parent email (Step 6)
- Decline → optional reason → `declineAgeReviewEngagement` → trigger parent email

Use existing `Button`, `Dialog` patterns from `CancelEnrolmentDialog.tsx`.

### 4b — Deep link

**File:** `StudentsList.tsx`

- Read `searchParams.get('engagement')`
- On mount: if present, find person_id for that engagement (query `engagements`), call `setSlideOverPersonId(personId)`, scroll/highlight engagement in slide-over

**File:** `StudentSlideOver.tsx`

- Pass engagement list to panel; render `AgeReviewAdminPanel` for matching `admin_review` row

### 4c — Badges

**File:** `EnrolmentRowActions.tsx`

- If `age_override_at` set (admin approved or override): small badge `t('pages.enrolment.age_exception_badge')`
- `admin_review` status already has color in `ENROLMENT_STATUS_COLORS`

---

## Step 5 — Email templates

Add to `packages/shared/src/i18n/email.ts`:

```typescript
ENROLMENT_AGE_REVIEW_REQUESTED: 'enrolment_age_review_requested',
ENROLMENT_AGE_REVIEW_APPROVED: 'enrolment_age_review_approved',
ENROLMENT_AGE_REVIEW_DECLINED: 'enrolment_age_review_declined',
```

**Create React email components** (follow `EnrolmentConfirmationEmail.tsx` / `BaseEmailTemplate.tsx`):

| Template | Variables |
| --- | --- |
| `EnrolmentAgeReviewRequestedEmail.tsx` | `schoolName`, `studentName`, `className`, `studentAge`, `classAgeRange`, `parentNote`, `reviewUrl` |
| `EnrolmentAgeReviewApprovedEmail.tsx` | `schoolName`, `studentName`, `className`, `payUrl` (or completion link — see below) |
| `EnrolmentAgeReviewDeclinedEmail.tsx` | `schoolName`, `studentName`, `className`, `declineReason?` |

**i18n:** add strings to `packages/shared/src/i18n/email-templates-en.json` and `email-templates-he.json`.

**Wire:** `packages/shared/src/email/render-template.ts` — add 3 cases to switch.

**Register:** ensure `send-notification` accepts names (uses `isSupportedEmailTemplate` from bundled dist).

**reviewUrl:**

```
https://{tenantSubdomain}.{APP_DOMAIN}/admin/students?engagement={engagementId}
```

Use tenant subdomain from config; no auth tokens.

**payUrl on approve:** Reuse existing admin completion / enrol pay link pattern from `docs/plans/archive/admin-enrolment-completion-link.md` — e.g. `/enrol/pay/{engagementId}?token=...` via existing edge function if engagement has token, OR `/enrol` with state. **Do not invent new payment flow.**

```bash
pnpm email:bundle
```

---

## Step 6 — Send notifications

After RPC success in web app (simplest V1 — no pg_net in RPC):

**Create:** `apps/web/src/features/enrolment/lib/sendAgeReviewNotifications.ts`

| Event | Recipients | Template |
| --- | --- | --- |
| Review submitted | All emails from `user_profiles` where `'tenant_admin' = ANY(role)` and `tenant_id` matches | `enrolment_age_review_requested` |
| Approved | Guardian email (`resolveGuardianEmail` or engagement billing account holder) | `enrolment_age_review_approved` |
| Declined | Same guardian email | `enrolment_age_review_declined` |

Invoke existing `supabase.functions.invoke('send-notification', { body: { ... } })` pattern used elsewhere (grep `send-notification` in `apps/web`).

Call from:

- Review form success handler
- `AgeReviewAdminPanel` approve/decline handlers

---

## Step 7 — i18n (app UI)

Add to `apps/web/src/i18n/en.json` and `he.json` under `pages.enrolment`:

```
age_review_request_button
age_review_note_label
age_review_note_placeholder
age_review_submitted_title
age_review_submitted_body
age_review_admin_title
age_review_approve
age_review_decline
age_review_decline_confirm
age_exception_badge
age_review_error_note_too_short
age_review_error_generic
```

EN and HE keys must match structure.

---

## Step 8 — Tests

**Create:** `apps/web/src/__tests__/ageReviewRequest.test.ts` (optional but recommended)

- Zod note validation (9 chars fail, 10 pass)
- Mock RPC error mapping

**Extend:** `enrolment-transitions.test.ts` if needed for `admin_review` cancel still allowed (already in `cancel_engagement`).

---

## Step 9 — Verify

```bash
pnpm db:push   # or db:reset-and-types:local
pnpm db:types:all
pnpm -C packages/shared build
pnpm email:bundle
pnpm -C apps/web test
pnpm run lint
pnpm run build
```

Deploy edge functions only if `send-notification` changed.

---

## Definition of done (report PASS/FAIL)

- [ ] Guest age-blocked sees **Request studio review** (never override checkbox)
- [ ] Submit creates `admin_review` engagement with `age_review_note` + `age_at_season_start`
- [ ] No checkout step after review submit
- [ ] Admins receive email with `/admin/students?engagement=` link
- [ ] Deep link opens student slide-over with review panel
- [ ] Approve → `pending_payment`, `age_override_*` set, parent email with pay/completion link
- [ ] Decline → `cancelled`, parent email sent
- [ ] Eligible parent enrolment unchanged
- [ ] Admin override path (PR A) unchanged
- [ ] `cancel_engagement` still works on `admin_review`
- [ ] lint + build + tests pass

---

## Manual smoke matrix

1. Public `/classes` → Enrol on age-incompatible class as guest → enter family + ineligible DOB → review form → submit → confirmation, DB row `admin_review`.
2. Admin email arrives → click link → slide-over → Approve → parent email → engagement `pending_payment`.
3. Repeat flow → Decline → engagement `cancelled`.
4. Admin enrol modal override still works (regression).
5. Parent with eligible age → normal enrolment (regression).

---

## Files touched (checklist)

| Action | Path |
| --- | --- |
| NEW | `supabase/migrations/20260626000200_age_review_rpcs.sql` |
| NEW | `AgeReviewRequestForm.tsx`, `AgeReviewAdminPanel.tsx`, `ageReviewService.ts`, `sendAgeReviewNotifications.ts` |
| NEW | 3 email templates + i18n json + `render-template.ts` cases |
| EDIT | `intakeService.ts`, `selectedClassAgeValidation.tsx`, `StepSelectStudent.tsx`, `EnrolmentStepper.tsx`, `StepClass.tsx` |
| EDIT | `StudentsList.tsx`, `StudentSlideOver.tsx`, `EnrolmentRowActions.tsx` |
| EDIT | `packages/shared/src/i18n/email.ts`, `en.json`, `he.json` |
| EDIT | `send-notification/index.ts` if needed |
| REGEN | `database.types.ts`, email-dist via `pnpm db:types:all` + `pnpm email:bundle` |

---

## Completion report format

1. DoD checklist (PASS/FAIL)
2. Files changed
3. Commands run + outcomes
4. Blockers
5. Update [IMPLEMENTATION_STATUS.md](../../IMPLEMENTATION_STATUS.md) row to ✅ when complete
