# Parent self-enrolment — locked contracts

**Agents must not deviate from this file.** If implementation conflicts with stage prose, stop and ask the user.

## Problem statement (verified)

Parents with `account_holder` / `parent` / `guardian` roles cannot reliably enrol themselves in adult classes because:

1. **Parent portal** (`useParentPortal`) lists only `people.account_id IS NOT NULL` — guardian person rows intentionally have `account_id = NULL`.
2. **Enrolment person step** shows **Myself** only when `EnrolmentOnboardingService.getGuardianProfile` succeeds; if `account_members.person_id` is missing while `user_profiles.person_id` exists, the guardian is excluded from the child list **and** Myself is hidden.
3. **Parent mode + adult intake** has no “create new adult” path — Myself (or profile setup) is the only self-service route.

## Scope

| In scope | Out of scope |
| --- | --- |
| Canonical guardian resolution for portal + enrolment | New SQL migrations / RPCs |
| Portal **Myself** section with enrolments + CTA | Parent withdrawal (Unenrol Phase 3) |
| Resilient **Myself** in enrolment person step | Admin enrolment UX changes |
| Adult-intake **guardian profile setup** when person missing or DOB missing | `ContactPreferencesEditor` / upcoming sessions ([parent-portal-polish.md](../parent-portal-polish.md)) |
| Unit tests for pure logic | E2E Playwright (manual smoke only) |

## Data model (do not change)

| Entity | Rule |
| --- | --- |
| **Child / student** `people` row | `account_id` = family account UUID |
| **Guardian** `people` row | `account_id` **must stay NULL** (see `onboardingService.createMinorWithFamily`, `supabase/seed.sql` guardian row) |
| **Guardian link** | `account_members.person_id` → guardian `people.id`; `user_profiles.person_id` may mirror guardian id |
| **Self-enrolment engagement** | `engagements.person_id` = guardian `people.id` (not child) |

## Constants

| Name | Value | Where |
| --- | --- | --- |
| `ADULT_INTAKE_MIN_AGE` | `18` | `apps/web/src/features/enrolment/lib/offering-intake.ts` (`isAdultOffering`) |
| `GUARDIAN_MEMBER_ROLES` | `['account_holder', 'member']` | Guardian resolution only |
| `PORTAL_ENROLMENT_STATUSES` | `active`, `pending_payment`, `admin_review`, `pending_offer` | Same set as portal highlight / list filters |

## Query keys (exact)

| Key | Owner | Invalidate when |
| --- | --- | --- |
| `['parent-portal', tenantId, userId]` | `useParentPortal` | Guardian create/update, child CRUD, enrolment success |
| `['enrolment-guardian', tenantId, userId]` | `useEnrolmentContext` | Guardian ensure/update |
| `['account-students', tenantId, userId, accountIdOverride?]` | `useAccountStudents` | Same as guardian |

## Canonical API — guardian resolution

**Single entry point for all stages.** Implement in:

`apps/web/src/features/enrolment/lib/resolveGuardianProfile.ts`

```typescript
export type ResolveGuardianProfileInput = {
  tenant: Tenant;
  userProfileId: string;
  userEmail: string | null | undefined;
  userPersonId: string | null | undefined;
};

export type ResolveGuardianProfileResult =
  | { status: 'found'; profile: GuardianProfile }
  | { status: 'missing_account'; error: Error }
  | { status: 'missing_person'; accountId: string; accountMemberId: string }
  | { status: 'error'; error: Error };
```

### Resolution algorithm (order — mandatory)

1. **`getParentAccountId(userProfileId)`** — on failure → `missing_account`.
2. Load **`account_members`** row for `(account_id, user_profile_id)` with role in `GUARDIAN_MEMBER_ROLES`. Prefer `account_holder` if multiple (same rule as `getParentAccountId`).
3. **If `member.person_id` is set:** load person → build `GuardianProfile` → `found`.
4. **Else if `userPersonId` is set:** load that person → build profile using `accountId` + `member.id` as `accountMemberId` → **`found`**.  
   - **Side effect (allowed in P1):** if `member.person_id` is NULL, `UPDATE account_members SET person_id = userPersonId WHERE id = member.id` (TenantDB.update). Log audit `UPDATE account_members`.
5. **Else** → `missing_person` (return `accountId`, `accountMemberId` for P3 setup UI).

`GuardianProfile` shape is **unchanged** (`onboardingService.ts`):

```typescript
interface GuardianProfile {
  personId: string;
  accountId: string;
  accountMemberId: string;
  name: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
}
```

### Refactor rule

- `EnrolmentOnboardingService.getGuardianProfile` **must delegate** to `resolveGuardianProfile` and throw only when `status !== 'found'` (preserve existing throw messages for callers that expect exceptions).
- Do **not** duplicate resolution logic in hooks.

## Canonical API — ensure guardian person (P3)

`apps/web/src/features/enrolment/onboardingService.ts`

```typescript
static async ensureGuardianPersonForParent(
  tenant: Tenant,
  input: {
    userProfileId: string;
    userEmail: string | null | undefined;
    accountId: string;
    accountMemberId: string;
    name: string;
    dateOfBirth: string; // YYYY-MM-DD, required for adult intake
    phone?: string | null;
  },
): Promise<GuardianProfile>
```

**Steps (exact):**

1. Validate `name` (min 1, max 200) and `dateOfBirth` (ISO date).
2. Insert `people` row: `{ name, email: userEmail, date_of_birth, emergency_contact_phone: phone, status: 'active' }` — **no `account_id`**.
3. `UPDATE account_members SET person_id = newPerson.id WHERE id = accountMemberId`.
4. `UPDATE user_profiles SET person_id = newPerson.id WHERE id = userProfileId` (supabase direct or existing pattern — must set both).
5. `logAudit` CREATE people + UPDATE account_members.
6. Return `GuardianProfile` built from new person.

**Forbidden:** setting `account_id` on guardian person; creating a second account.

### Update DOB only

```typescript
static async updateGuardianDateOfBirth(
  tenant: Tenant,
  personId: string,
  dateOfBirth: string,
): Promise<Person>
```

- TenantDB.update `people.date_of_birth` only.
- Caller must verify `personId` matches resolved guardian.

## Portal data contract

`useParentPortal` return type **becomes**:

```typescript
export interface ParentPortalData {
  guardian: GuardianProfile | null;
  guardianMissing: boolean; // true when resolve → missing_person
  children: Person[];
  enrolmentsByPerson: Record<string, EngagementWithOffering[]>;
  payments: ParentPayment[];
}
```

- **`guardian`:** from `resolveGuardianProfile` when `found`; else `null`.
- **`children`:** unchanged filter — `people.account_id != null` (guardian never in children list).
- **Enrolments:** fetch for `children.map(id)` **plus** `guardian.personId` when present (single query with `.in('person_id', ids)`).

## Portal UI contract

**Section order** in `ParentPortal.tsx`:

1. Success banner (unchanged)
2. Header + global “Register for a class” (unchanged)
3. **`GuardianSelfSection`** — only when `guardian != null`
4. **My children** section (unchanged logic)
5. Payments (unchanged)

**`GuardianSelfSection`:**

| Element | Rule |
| --- | --- |
| Heading | `pages.portal.myself_heading` |
| Name | `{guardian.name}` + `(pages.enrolment.enrol_myself)` in muted text |
| DOB | Show when `guardian.dateOfBirth` set; else `pages.portal.myself_dob_missing` hint |
| Enrolments | Reuse `EnrolmentRow` list; filter via same status filter as children |
| Primary CTA | `pages.classes.enrol` → `navigate('/enrol', { state: { personId: guardian.personId, from: '/dashboard/portal', mode: 'parent' } })` |
| `id` anchor | `portal-guardian-self` for highlight scroll (optional; mirror `portal-child-{id}`) |

**When `guardianMissing`:** show card with `pages.portal.myself_setup_required` + button → `/enrol` (no personId — forces P3 setup on adult class) or inline link to enrol flow.

**Subtitle copy:** change `pages.portal.subtitle` to family-oriented wording (en + he).

## Enrolment UI contract

### Person step — Myself visibility

Show **Myself** button when **any** of:

- `guardian` prop is non-null (`GuardianProfile`), OR
- `resolvedGuardianPersonId` from `useResolvedGuardianPerson` hook (P3) is non-null **and** person record loaded

Hide Myself when guardian age **ineligible** for selected class (keep existing disabled/ineligible UI).

### Adult intake + parent mode — profile setup panel

Show **`GuardianProfileSetupPanel`** when **all**:

- `mode === 'parent'`
- `isAdultIntake === true`
- `resolveGuardianProfile` → `missing_person` **OR** (`found` && `!profile.dateOfBirth`)

**Panel fields:** name (prefill from user email display name or empty), date of birth (required), optional phone.

**Submit:** calls `ensureGuardianPersonForParent` OR `updateGuardianDateOfBirth` + invalidate queries → auto-select guardian via `onSelectPerson(personId, dob)`.

**Do not show** “Add a new child” as the only action in this state — panel appears **above** child list.

### EnrollmentIntent from portal

```typescript
{
  personId: string;      // guardian.personId
  from: '/dashboard/portal';
  mode: 'parent';        // prevents admin mode when user is also tenant_admin
}
```

`readEnrollmentIntent` already persists `personId`; `canSkipPersonStep` must remain true when `personId` set.

## i18n keys (exact — add to en.json + he.json)

Under `pages.portal`:

| Key | EN value |
| --- | --- |
| `subtitle` | `View your classes, your children's enrolments, and payment history.` |
| `myself_heading` | `Myself` |
| `myself_dob_missing` | `Add your date of birth when registering for an adult class.` |
| `myself_setup_required` | `Complete your profile to register yourself for adult classes.` |
| `myself_setup_cta` | `Complete profile` |
| `enrolments_for_self` | `My enrolments` |

Reuse existing: `pages.enrolment.enrol_myself`, `pages.classes.enrol`, `pages.portal.no_enrolments`.

Under `pages.enrolment`:

| Key | EN value |
| --- | --- |
| `guardian_setup_title` | `Your details` |
| `guardian_setup_desc` | `We need your date of birth to register you for this adult class.` |
| `guardian_setup_submit` | `Continue` |

## Files allowed (union of all stages)

```
apps/web/src/features/enrolment/lib/resolveGuardianProfile.ts          # NEW P1
apps/web/src/features/enrolment/lib/resolveGuardianProfile.test.ts     # NEW P1
apps/web/src/features/enrolment/onboardingService.ts                   # P1, P3
apps/web/src/features/enrolment/hooks/useEnrolmentContext.ts           # P1, P3
apps/web/src/features/enrolment/hooks/useAccountStudents.ts          # P1 (align guardianPersonId)
apps/web/src/features/enrolment/components/StepSelectStudent.tsx     # P3
apps/web/src/features/enrolment/components/GuardianProfileSetupPanel.tsx # NEW P3
apps/web/src/components/Dashboard/useParentPortal.ts                 # P2
apps/web/src/components/Dashboard/ParentPortal.tsx                   # P2
apps/web/src/components/Dashboard/GuardianSelfSection.tsx            # NEW P2
apps/web/src/i18n/en.json
apps/web/src/i18n/he.json
apps/web/src/__tests__/filterStudentCandidates.test.ts               # unchanged unless regression
apps/web/src/__tests__/resolveGuardianProfile.test.ts                # NEW P1
apps/web/src/__tests__/parent-portal-guardian.test.ts                # NEW P2 (pure helpers)
```

## Forbidden (all stages)

- SQL migrations or new RPCs
- Setting `account_id` on guardian `people` rows
- Listing guardian in `children` array without dedicated **Myself** section
- Duplicating guardian resolution outside `resolveGuardianProfile.ts`
- `autoFocus` on form inputs (eslint `jsx-a11y/no-autofocus`)
- Git commit/push unless user explicitly requests
- Implementing [parent-portal-polish.md](../parent-portal-polish.md) notification/upcoming sessions in this epic

## Verification commands

```bash
pnpm -C apps/web run lint
pnpm -C apps/web test resolveGuardianProfile parent-portal-guardian filterStudentCandidates
pnpm run regtest   # user runs before merge; agent runs lint + unit tests minimum
```

## Manual smoke (post P3)

1. Log in as seed parent `miriamrstern@gmail.com` → portal shows **Myself** with DOB + enrol CTA.
2. `/enrol` on adult class (min_age ≥ 18) → **Myself** selectable; completes flow.
3. Simulate missing guardian person (dev DB: null `account_members.person_id` and `user_profiles.person_id`) → portal shows setup card; enrolment shows **Your details** panel.
4. After setup, Myself appears; child list unchanged.
5. Hebrew locale: new keys render; RTL layout acceptable.
