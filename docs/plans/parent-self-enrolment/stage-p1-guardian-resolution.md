# Stage P1 — Guardian resolution (canonical)

**Prerequisites:** None.  
**Contracts:** [CONTRACTS.md](CONTRACTS.md) — resolution algorithm is normative.  
**Next:** P2 (portal) and P3 (enrolment) depend on this stage.

## Goal

One tested code path resolves the logged-in parent's guardian identity for portal and enrolment. Eliminates split-brain between `getGuardianProfile`, `useAccountStudents.guardianPersonId`, and `user_profiles.person_id`.

## Scope IN

### 1. New module `resolveGuardianProfile.ts`

Implement exactly the algorithm in CONTRACTS § “Resolution algorithm”.

**Exports:**

- `resolveGuardianProfile(input): Promise<ResolveGuardianProfileResult>`
- `guardianProfileFromPerson(person, accountId, accountMemberId, userEmail): GuardianProfile` — pure builder for tests

**Dependencies:**

- `EnrolmentOnboardingService.getParentAccountId`
- `TenantDB.selectFor` / `TenantDB.update` for `account_members`, `people`
- `PersonSchema.parse`

**Backfill side effect (step 4):** When using `userPersonId` fallback and `member.person_id` is NULL, update member row. Use `BaseService.logAudit` for UPDATE.

### 2. Refactor `onboardingService.ts`

Replace body of `getGuardianProfile` with:

```typescript
const result = await resolveGuardianProfile({ tenant, userProfileId, userEmail, userPersonId: undefined });
if (result.status === 'found') return result.profile;
if (result.status === 'missing_account') throw new Error('No family account linked to this login.');
if (result.status === 'missing_person') throw new Error('Guardian person not linked to this account.');
throw result.error;
```

**Add optional parameter** to `getGuardianProfile` for P3 (non-breaking):

```typescript
static async getGuardianProfile(
  tenant: Tenant,
  userProfileId: string,
  userEmail: string | null | undefined,
  options?: { userPersonId?: string | null },
): Promise<GuardianProfile>
```

Pass `options?.userPersonId` into `resolveGuardianProfile`.

### 3. Align `useAccountStudents.ts`

After loading account members, resolve guardian id using **same order** as CONTRACTS:

```typescript
const guardianPersonId =
  memberRow?.person_id ??
  user.person_id ??
  null;
```

Do not duplicate full `resolveGuardianProfile` in the hook — import a sync helper if needed:

```typescript
export function coalesceGuardianPersonId(
  memberPersonId: string | null | undefined,
  userPersonId: string | null | undefined,
): string | null
```

Place coalesce in `resolveGuardianProfile.ts`.

### 4. Wire `useEnrolmentContext.ts`

- Pass `user?.person_id` into guardian query via updated `getGuardianProfile`.
- On `missing_person`, set `guardian: null` but expose new field:

```typescript
guardianSetupRequired: boolean; // true when resolve → missing_person OR (found && !dateOfBirth) && isAdultIntake
```

Compute `guardianSetupRequired` in the hook from resolve result + `isAdultIntake` (P3 consumes this; in P1 set field, default false until offering loaded).

**Minimal P1 change:** guardian query uses refactored `getGuardianProfile` with `userPersonId` fallback — no UI yet.

## Scope OUT

- Portal UI (P2)
- `ensureGuardianPersonForParent` (P3)
- `GuardianProfileSetupPanel` (P3)

## Unit tests — `resolveGuardianProfile.test.ts`

Mock `TenantDB` / supabase at service boundary OR test pure helpers + integration-style with vi.mock on `getParentAccountId`.

| Case | Expected |
| --- | --- |
| Member has `person_id` | `found`, profile matches person |
| Member null, `userPersonId` set | `found`, backfill member called |
| Member null, no user person | `missing_person` + accountId |
| No account | `missing_account` |
| `coalesceGuardianPersonId(member, user)` | prefers member |

Minimum **5** test cases.

## Files allowed

```
apps/web/src/features/enrolment/lib/resolveGuardianProfile.ts
apps/web/src/features/enrolment/lib/resolveGuardianProfile.test.ts
apps/web/src/features/enrolment/onboardingService.ts
apps/web/src/features/enrolment/hooks/useAccountStudents.ts
apps/web/src/features/enrolment/hooks/useEnrolmentContext.ts
```

## Forbidden

- UI component changes
- i18n changes (P2/P3)
- New migrations

## DoD checklist

- [ ] `resolveGuardianProfile` implements CONTRACTS algorithm exactly
- [ ] `getGuardianProfile` delegates; existing callers unchanged behavior when member.person_id set
- [ ] Fallback path: user.person_id works when member.person_id null (seed Miriam scenario)
- [ ] `useAccountStudents.guardianPersonId` uses coalesce helper
- [ ] `useEnrolmentContext` passes `user.person_id` to guardian load
- [ ] Unit tests pass
- [ ] `pnpm -C apps/web run lint` passes

## Stop condition

Post completion report. **Do not implement P2 or P3.**
