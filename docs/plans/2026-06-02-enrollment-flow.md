# Enrollment Flow Redesign (2026-06-02)

See plan: robust enrollment flow — context-aware student selection, schema-aligned onboarding, admin search.

**Follow-on:** [Guest enrollment & portal provisioning](./2026-06-02-guest-enrollment-portal-provisioning.md) — public guest checkout, post-payment magic link, fix `linkAuthUserToPerson`.

## Domain rule

One logged-in parent belongs to exactly one account (family).

## Implementation phases

1. Schema-aligned onboarding (`EnrolmentOnboardingService`)
2. `useEnrolmentContext`, `useAccountStudents`, `filterStudentCandidates`
3. `StepSelectStudent` replaces email returning lookup
4. Admin `StudentSearchCombobox` + `PersonService.searchForEnrolment`
5. i18n, tests, seed fix (single account per parent)
