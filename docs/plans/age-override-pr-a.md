# PR A — Harden admin age override (paste into new agent chat)

## Mission

Finish the **admin-only age override** path. Do **not** build parent review request UI, approve/decline RPCs, or new email templates. PR B depends on this PR.

**Repo:** `manage-studio` (Ballet School OS)  
**SPEC:** §4.2.5 age bands · [overview](2026-06-02-age-override-and-review-request.md)  
**Prerequisite for:** [PR B — parent review](age-override-pr-b.md)

---

## Context (what already exists — do not re-implement)

| Item | Location |
| --- | --- |
| DB columns `age_override_*`, `age_review_note`, `age_at_season_start` | `supabase/migrations/20260608001300_engagements.sql` |
| Zod fields on `EngagementSchema` | `packages/shared/src/schemas.ts` |
| Age at season start helpers | `apps/web/src/features/enrolment/lib/check-requirements.ts` — `isAgeEligible`, `personAgeAtSeasonStart`, `isPersonEligibleForSelectedClass` |
| Admin override UI (inline, duplicated) | `AdminEnrolStudentModal.tsx`, `StepClass.tsx`, `StepSelectStudent.tsx`, `EnrolmentStepper.tsx` |
| `show_all_classes` toggle | Admin modal + `StepClass` |
| i18n override keys | `pages.enrolment.age_override_label`, `age_override_reason_placeholder`, `show_all_classes` in `en.json` / `he.json` |
| Server: authenticated create + admin role check | `apps/web/src/features/enrolment/service.ts` → `EnrolmentService.create` |
| Server: checkout edge path + admin check | `supabase/functions/_shared/resolve-or-create-engagement.ts`, `authorize-engagement-create.ts` |
| Edge age mirror | `supabase/functions/_shared/age-eligibility.ts` |

---

## Gaps this PR must close

1. **No shared policy module** — age block/allow logic is scattered.
2. **No `AgeOverridePanel`** — override UI duplicated in 4 components.
3. **`age_at_season_start` never set** on engagement insert (column exists, always null).
4. **Guest security gap** — `guest_enrolment_create_engagement` inserts without age validation.
5. **No unit tests** for policy decisions.

**Out of scope for PR A:** parent review form, `admin_review` create RPCs, emails, approve/decline, payment/checkout changes, audit_log in RPC (defer to PR B unless trivial).

---

## Hard rules

1. **Admin override only** — never show override checkbox to `guest` or `parent` flows (`allowAgeOverride` stays tied to `mode === 'admin'`).
2. **Age reference date = season `start_date`** — use existing helpers; never use today's date when season start is known.
3. **New migrations only** — never edit files under `supabase/migrations/20260608*` in place. Next file: **`supabase/migrations/20260626000100_age_engagement_helpers.sql`** (verify no collision: `ls supabase/migrations/`).
4. **No new npm packages** without user approval + `pnpm dlx snyk test`.
5. **No git commit/push** unless user explicitly asks.
6. **Do not touch** payment provider settings, Grow, Stripe, finance admin, or checkout amount logic.

---

## Step 1 — Shared age policy module

**Create:** `apps/web/src/features/enrolment/lib/ageEnrolmentPolicy.ts`

```typescript
export type AgeEnrolmentActor = 'guest' | 'parent' | 'admin';

export interface AgeEnrolmentDecision {
  eligible: boolean;       // false = out of band
  canValidate: boolean;    // false = missing DOB, band, or season start
  studentAge: number | null;
  classAges: string | null; // formatted range for UI
}

export function evaluateAgeEnrolment(input: {
  dateOfBirth?: string | null;
  ageBand?: ClassAgeContext | null;  // import from check-requirements
  seasonStartDate?: string | null;
  actor: AgeEnrolmentActor;
  ageOverrideConfirmed?: boolean;
}): AgeEnrolmentDecision;

export function shouldBlockAgeEnrolment(decision: AgeEnrolmentDecision, actor: AgeEnrolmentActor, ageOverrideConfirmed?: boolean): boolean;
// Returns true when: canValidate && !eligible && NOT (actor==='admin' && ageOverrideConfirmed)
```

Implementation must delegate to `isPersonEligibleForSelectedClass`, `personAgeAtSeasonStart`, `formatAgeRange` from `check-requirements.ts` — **no duplicate age math**.

**Refactor callers** (same PR):

| File | Change |
| --- | --- |
| `selectedClassAgeValidation.tsx` | Use `evaluateAgeEnrolment`; add optional `actor?: AgeEnrolmentActor` to hook/alert props |
| `apps/web/src/features/enrolment/lib/filterStudentCandidates.ts` | Pass `actor: 'parent'` or `'admin'` as appropriate |
| `EnrolmentStepper.tsx` | Map `enrolmentContext.mode` → actor (`admin` → `'admin'`, else `'parent'` or `'guest'`) |
| `AdminEnrolStudentModal.tsx` | Pass `actor: 'admin'` |

Keep existing public exports from `selectedClassAgeValidation.tsx` stable for other imports.

---

## Step 2 — Extract `AgeOverridePanel`

**Create:** `apps/web/src/features/enrolment/components/AgeOverridePanel.tsx`

```typescript
interface AgeOverridePanelProps {
  studentAge: number | null;
  classAges: string | null;
  confirmed: boolean;
  reason: string;
  onConfirmedChange: (confirmed: boolean) => void;
  onReasonChange: (reason: string) => void;
  disabled?: boolean;
}
```

Renders: amber warning (reuse `enrolmentAgeMismatchMessage`), checkbox with `t('pages.enrolment.age_override_label')`, optional reason textarea (`maxLength={500}`).

**Replace inline duplicate blocks in:**

- `AdminEnrolStudentModal.tsx`
- `StepClass.tsx`
- `StepSelectStudent.tsx` (admin override section only)
- `EnrolmentStepper.tsx` (pre-selected class admin block)

Do **not** change when override is shown — only extract UI.

---

## Step 3 — Set `age_at_season_start` on create

Whenever an engagement is inserted and age can be computed, set `age_at_season_start` (whole years at season start).

### 3a — Web service

**File:** `apps/web/src/features/enrolment/service.ts` → `EnrolmentService.create`

After loading person + offering + season start (existing block ~lines 159–220):

- Compute `const snapshot = personAgeAtSeasonStart(person.date_of_birth, seasonStartDate)` when both exist.
- Add `age_at_season_start: snapshot` to `insertPayload` when `snapshot != null` (eligible and ineligible paths).

### 3b — Edge function

**File:** `supabase/functions/_shared/resolve-or-create-engagement.ts`

- Add `personAgeAtSeasonStart` helper to `age-eligibility.ts` (mirror web logic) OR import shared computation inline.
- Set `insertPayload.age_at_season_start` when computable (same rule as web).

### 3c — SQL helper (migration)

**Create:** `supabase/migrations/20260626000100_age_engagement_helpers.sql`

```sql
-- Shared age snapshot for RPCs (PR B will reuse)
CREATE OR REPLACE FUNCTION public.engagement_age_at_season_start(
  p_person_id UUID,
  p_offering_id UUID
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
-- Load people.date_of_birth, offerings.min_age/max_age/season_id, seasons.start_date
-- Return whole years at season start (same algorithm as app: year diff adjusted for month/day)
-- Return NULL if any input missing
$$;

REVOKE ALL ON FUNCTION public.engagement_age_at_season_start(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engagement_age_at_season_start(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_age_at_season_start(UUID, UUID) TO service_role;
```

Use this helper inside the amended guest RPC (Step 4).

---

## Step 4 — Close guest age bypass

**Same migration file** — `CREATE OR REPLACE` for `public.guest_enrolment_create_engagement` (copy body from `20260608002100_guest_enrolment_rpcs.sql`, then add age gate **before** INSERT):

Logic to add:

1. Load student `date_of_birth`, offering `min_age`, `max_age`, season `start_date`.
2. If age band configured and student age at season start is **out of band** → `RAISE EXCEPTION 'AGE_INELIGIBLE'`.
3. If eligible or no band → proceed as today.
4. Set `age_at_season_start` on INSERT using `engagement_age_at_season_start(p_student_person_id, p_offering_id)`.

**Do not** allow override in this RPC — guests must wait for PR B review RPC.

Re-apply existing `GRANT EXECUTE` lines at end of migration.

---

## Step 5 — Tests

**Create:** `apps/web/src/__tests__/ageEnrolmentPolicy.test.ts`

| Case | Expected `shouldBlockAgeEnrolment` |
| --- | --- |
| guest, ineligible, no override | `true` |
| parent, ineligible, no override | `true` |
| admin, ineligible, no override | `true` |
| admin, ineligible, override confirmed | `false` |
| admin, eligible | `false` |
| missing season start (`canValidate: false`) | `false` (do not block) |

Use fixture DOB + Mini class band (3–4) + season start from `check-requirements.test.ts` (`SEASON_START`).

Do **not** break existing `check-requirements.test.ts`.

---

## Step 6 — Verify & deploy

```bash
# After migration (hosted: pnpm db:push; local: pnpm db:reset-and-types:local)
pnpm db:types:all
pnpm -C packages/shared build
pnpm -C apps/web test -- ageEnrolmentPolicy check-requirements
pnpm run lint
pnpm run build
```

If `resolve-or-create-engagement.ts` changed, redeploy edge functions that use it (`prepare-enrolment-checkout`, `create-enrolment-intake` — grep for imports).

---

## Definition of done (report PASS/FAIL for each)

- [ ] `evaluateAgeEnrolment` / `shouldBlockAgeEnrolment` exported and used by `selectedClassAgeValidation.tsx`
- [ ] `AgeOverridePanel` replaces inline override UI in all 4 components
- [ ] New engagements (admin override path) persist `age_at_season_start`
- [ ] Edge checkout path persists `age_at_season_start`
- [ ] `guest_enrolment_create_engagement` raises `AGE_INELIGIBLE` for out-of-band guests
- [ ] Override checkbox still only visible when `allowAgeOverride` / admin mode
- [ ] Non-admin `age_override_confirmed: true` still returns 403 from service + edge
- [ ] `ageEnrolmentPolicy.test.ts` passes
- [ ] lint + build pass

---

## Manual smoke (dev tenant)

1. **Admin enrol modal:** student age 3, class 4–6 → override required → creates engagement with `age_override_at` + `age_at_season_start` populated.
2. **Admin eligible class:** no override UI needed; `age_at_season_start` still set.
3. **Guest RPC:** attempt guest create engagement with ineligible age → error (not silent insert). *Full review UI comes in PR B.*

---

## Files touched (checklist)

| Action | Path |
| --- | --- |
| NEW | `apps/web/src/features/enrolment/lib/ageEnrolmentPolicy.ts` |
| NEW | `apps/web/src/features/enrolment/components/AgeOverridePanel.tsx` |
| NEW | `apps/web/src/__tests__/ageEnrolmentPolicy.test.ts` |
| NEW | `supabase/migrations/20260626000100_age_engagement_helpers.sql` |
| EDIT | `selectedClassAgeValidation.tsx` |
| EDIT | `filterStudentCandidates.ts` |
| EDIT | `EnrolmentStepper.tsx`, `StepClass.tsx`, `StepSelectStudent.tsx`, `AdminEnrolStudentModal.tsx` |
| EDIT | `service.ts` |
| EDIT | `supabase/functions/_shared/age-eligibility.ts` |
| EDIT | `supabase/functions/_shared/resolve-or-create-engagement.ts` |

---

## Completion report format

When done, reply with:

1. DoD checklist (PASS/FAIL each item)
2. Files changed (list)
3. Commands run + outcomes
4. Blockers (if any)
5. **Stop** — do not start PR B in this session
