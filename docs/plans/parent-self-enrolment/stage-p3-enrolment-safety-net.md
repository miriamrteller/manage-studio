# Stage P3 — Enrolment safety net + adult profile setup

**Prerequisites:** P1 + P2 complete.  
**Contracts:** [CONTRACTS.md](CONTRACTS.md) — ensure API + enrolment UI.

## Goal

Parents always have a path to self-enrol in adult classes: resilient **Myself** in the person step, plus **Your details** setup when guardian person or DOB is missing.

## Scope IN

### 1. Service methods — `onboardingService.ts`

Implement CONTRACTS APIs:

- `ensureGuardianPersonForParent(...)` — full create + link flow
- `updateGuardianDateOfBirth(tenant, personId, dateOfBirth)`

Both must use `TenantDB`, `PersonSchema`, `logAudit`.

### 2. `useEnrolmentContext.ts` — full guardian state

Extend guardian query to use `resolveGuardianProfile` directly (not only throwing `getGuardianProfile`):

```typescript
export interface EnrolmentContextValue {
  // ...existing
  guardian: GuardianProfile | null;
  guardianResolveStatus: 'found' | 'missing_person' | 'missing_account' | 'loading' | 'error';
  guardianSetupRequired: boolean; // missing_person OR (found && !dateOfBirth && isAdultIntake)
  guardianAccountId?: string;       // when missing_person
  guardianAccountMemberId?: string;
}
```

**Rules:**

- `guardianSetupRequired = true` when adult class selected and guardian cannot be age-validated.
- Do not set `isLoading` false until guardian resolve completes when `mode === 'parent'`.

### 3. New `GuardianProfileSetupPanel.tsx`

**Path:** `apps/web/src/features/enrolment/components/GuardianProfileSetupPanel.tsx`

**Props:**

```typescript
interface GuardianProfileSetupPanelProps {
  mode: 'create' | 'update_dob';
  defaultName?: string;
  defaultDateOfBirth?: string;
  accountId: string;
  accountMemberId: string;
  onComplete: (personId: string, dateOfBirth: string) => void;
  onCancel?: () => void;
}
```

**Behavior:**

- `create` → `ensureGuardianPersonForParent`
- `update_dob` → `updateGuardianDateOfBirth` (requires existing `personId` prop — add to props when mode update)
- On success: invalidate `enrolment-guardian`, `account-students`, `parent-portal` query keys
- Show errors with `role="alert"`
- No `autoFocus`

### 4. Update `StepSelectStudent.tsx`

**When `guardianSetupRequired`** (from new props):

- Render `GuardianProfileSetupPanel` at top of choose view (before child list).
- Hide Myself row until setup completes.
- On complete → call `onSelectPerson(personId, dob)` OR parent callback to refresh guardian prop (prefer invalidate + parent re-fetch via query).

**Myself resilience:**

Add prop optional `fallbackGuardianPersonId: string | null`.

Show Myself when:

```typescript
const myselfProfile = guardian ?? (fallbackGuardianPerson && loadedPerson ? buildDisplay(...) : null);
```

Prefer passing refreshed `guardian` from context after resolve; keep diff minimal.

**Adult intake button row:**

When `isAdultIntake && mode === 'parent' && !guardianSetupRequired`:

- Keep child list + Myself + Add child (unchanged).

When `guardianSetupRequired`:

- Hide **Add a new child** primary action until setup done (avoid wrong path); show helper text pointing to setup panel.

### 5. Update `EnrolmentStepper.tsx`

Pass new context fields into `StepSelectStudent`:

```typescript
guardian={enrolmentContext.guardian}
guardianSetupRequired={enrolmentContext.guardianSetupRequired}
guardianAccountId={enrolmentContext.guardianAccountId}
guardianAccountMemberId={enrolmentContext.guardianAccountMemberId}
fallbackGuardianPersonId={accountStudentsQuery.data?.guardianPersonId ?? null}
```

After setup panel success, refetch guardian query before advancing.

### 6. i18n

Add CONTRACTS `pages.enrolment.guardian_setup_*` keys (en + he).

Hebrew:

| Key | HE |
| --- | --- |
| `guardian_setup_title` | `הפרטים שלך` |
| `guardian_setup_desc` | `נדרש תאריך לידה כדי לרשום אותך לשיעור למבוגרים.` |
| `guardian_setup_submit` | `המשך` |

### 7. Tests

**New or extend:** `apps/web/src/__tests__/guardian-profile-setup.test.ts`

- Mock service; verify `guardianSetupRequired` logic (pure function exported from hook file or small `guardianSetupRequired.ts` helper — **prefer pure helper** for testability):

```typescript
export function computeGuardianSetupRequired(input: {
  isAdultIntake: boolean;
  resolveStatus: 'found' | 'missing_person' | ...;
  dateOfBirth: string | null;
}): boolean
```

| Input | Output |
| --- | --- |
| adult + missing_person | true |
| adult + found + no DOB | true |
| adult + found + DOB | false |
| minor class + missing_person | false |

## Scope OUT

- Portal layout changes beyond query invalidation
- Admin enrolment
- Migrations

## Files allowed

```
apps/web/src/features/enrolment/onboardingService.ts
apps/web/src/features/enrolment/hooks/useEnrolmentContext.ts
apps/web/src/features/enrolment/components/GuardianProfileSetupPanel.tsx
apps/web/src/features/enrolment/components/StepSelectStudent.tsx
apps/web/src/features/enrolment/components/EnrolmentStepper.tsx
apps/web/src/features/enrolment/lib/guardianSetupRequired.ts    # optional pure helper
apps/web/src/__tests__/guardian-profile-setup.test.ts
apps/web/src/i18n/en.json
apps/web/src/i18n/he.json
docs/IMPLEMENTATION_STATUS.md                                   # brief entry after P3
```

## Forbidden

- Creating guardian with `account_id`
- autoFocus
- Skipping DOB validation on adult intake setup

## DoD checklist

- [ ] `ensureGuardianPersonForParent` creates person + links member + user profile
- [ ] Adult class + missing guardian → setup panel → can complete enrolment as self
- [ ] Adult class + guardian without DOB → update DOB path works
- [ ] Myself visible when P1 fallback resolves guardian
- [ ] `EnrollmentIntent.personId` from portal still skips person step
- [ ] Query invalidation refreshes portal Myself section after setup
- [ ] Unit tests for `computeGuardianSetupRequired`
- [ ] Lint + tests pass
- [ ] `docs/IMPLEMENTATION_STATUS.md` updated

## Manual smoke (full epic)

1. Seed parent → portal Myself → enrol adult class → pay/waiver path starts.
2. DB: null guardian person → portal setup card → enrol → setup panel → Myself works.
3. DB: guardian without DOB → adult class → prompted for DOB → continue.
4. Child enrolment unchanged.

## Stop condition

Post completion report. Final stage — epic complete after user review.
