# Parent self-enrolment — Agent runbook (P1–P3)

Generate prompt: `pnpm parent-self-enrolment:prompt p1` (… `p3`).

**Every session:**

1. Attach `@docs/plans/parent-self-enrolment/CONTRACTS.md` (mandatory).
2. Attach `@.cursor/rules/parent-self-enrolment.mdc`.
3. Implement **one** stage only.
4. Post **completion report** (template at bottom).
5. **Stop** — do not start the next stage.

**No SQL migrations** in this epic.

---

## Stage P1 — Guardian resolution

```
Implement Stage P1 only — parent self-enrolment.

@docs/plans/parent-self-enrolment/CONTRACTS.md
@docs/plans/parent-self-enrolment/00-overview.md
@docs/plans/parent-self-enrolment/stage-p1-guardian-resolution.md
@.cursor/rules/parent-self-enrolment.mdc
@.instructions.md
@apps/web/src/features/enrolment/onboardingService.ts
@apps/web/src/features/enrolment/hooks/useEnrolmentContext.ts
@apps/web/src/features/enrolment/hooks/useAccountStudents.ts
@apps/web/src/features/enrolment/lib/filterStudentCandidates.ts

Goal: canonical resolveGuardianProfile + refactor getGuardianProfile; align useAccountStudents + useEnrolmentContext. No UI changes.

Commands:
  pnpm -C apps/web run lint
  pnpm -C apps/web test resolveGuardianProfile

Stop after P1 DoD. Do not start P2.
```

---

## Stage P2 — Portal Myself section

```
Implement Stage P2 only — parent self-enrolment.

@docs/plans/parent-self-enrolment/CONTRACTS.md
@docs/plans/parent-self-enrolment/00-overview.md
@docs/plans/parent-self-enrolment/stage-p2-portal-myself.md
@.cursor/rules/parent-self-enrolment.mdc
@.instructions.md
@apps/web/src/features/enrolment/lib/resolveGuardianProfile.ts
@apps/web/src/components/Dashboard/useParentPortal.ts
@apps/web/src/components/Dashboard/ParentPortal.tsx
@apps/web/src/lib/enrollment-intent.ts
@apps/web/src/lib/portalHighlight.ts

Goal: Myself section on parent portal; extend useParentPortal; GuardianSelfSection component; i18n en+he.

Commands:
  pnpm -C apps/web run lint
  pnpm -C apps/web test parent-portal-guardian

Stop after P2 DoD. Do not start P3.
```

---

## Stage P3 — Enrolment safety net

```
Implement Stage P3 only — parent self-enrolment.

@docs/plans/parent-self-enrolment/CONTRACTS.md
@docs/plans/parent-self-enrolment/00-overview.md
@docs/plans/parent-self-enrolment/stage-p3-enrolment-safety-net.md
@.cursor/rules/parent-self-enrolment.mdc
@.instructions.md
@apps/web/src/features/enrolment/components/StepSelectStudent.tsx
@apps/web/src/features/enrolment/components/EnrolmentStepper.tsx
@apps/web/src/features/enrolment/hooks/useEnrolmentContext.ts
@apps/web/src/features/enrolment/lib/offering-intake.ts

Goal: ensureGuardianPersonForParent; GuardianProfileSetupPanel; resilient Myself; adult intake DOB setup; update IMPLEMENTATION_STATUS.md.

Commands:
  pnpm -C apps/web run lint
  pnpm -C apps/web test guardian-profile-setup resolveGuardianProfile
  pnpm run regtest

Stop after P3 DoD. Final stage.
```

---

## Completion report template

```markdown
## Stage PN completion report

### DoD
- [ ] item — PASS/FAIL — notes

### Files changed
- path

### Commands
- command → result

### Blockers
- none | description

### Stop
Waiting for user to say "commit Stage PN" or "start P{N+1}".
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Myself still hidden | `resolveGuardianProfile` result; `account_members.person_id`; `user_profiles.person_id` |
| Guardian in children list | Violation — children filter must stay `account_id != null` only |
| Person step not skipped from portal | `EnrollmentIntent.mode: 'parent'` and `personId` in navigate state |
| ESLint autofocus fail | Remove `autoFocus` from new inputs |
| getGuardianProfile throws for Miriam seed | P1 fallback not wired; verify member id `00000000-0000-0000-0000-000000000701` |

## Cross-plan note

[parent-portal-polish.md](../parent-portal-polish.md) Step 4 (adult student view) is **superseded** by P2 Myself section for parents. Implement polish plan separately for contact prefs / upcoming sessions only.
