# Age override (admin) + parent review request — implementation plan

| Field | Value |
| --- | --- |
| **Status** | **In progress** — PR A ✅ complete; PR B 🟡 ~65% (backend done, UI wiring pending) |
| **SPEC** | §4.2.5 (age bands), §6 Phase 1C enrolment, `admin_review` status |
| **Depends on** | `check-requirements.ts`, `20260608001300_engagements.sql`, guest intake (`20260608002100_guest_enrolment_rpcs.sql`) |
| **Agent order** | **[PR A](age-override-pr-a.md)** (harden admin override) → **[PR B](age-override-pr-b.md)** (parent review + admin approve/decline + email) |
| **Out of scope** | Payments/checkout changes beyond blocking `admin_review`; WhatsApp for review requests |

---

## Problem

1. **Parents/guests** are blocked when age at **season start** falls outside `offerings.min_age` / `max_age`.
2. **Admins** must be able to intentionally place borderline students (with audit trail).
3. **Parents** need a path to ask the studio for an exception — not a dead end.

| Feature | Actor | Result |
| --- | --- | --- |
| **Admin age override** | `tenant_admin` only | Enrolment proceeds immediately (`pending_payment`); audit on engagement |
| **Parent review request** | guest / parent | Creates `admin_review` engagement; admin emailed; **no checkout** until approved |

Do not conflate these two flows.

---

## Progress audit (2026-06-25)

Cross-checked migrations, edge functions, and enrolment UI.

| Item | Status | Location / notes |
| --- | --- | --- |
| Schema: `age_override_*`, `age_review_note`, `age_at_season_start` | ✅ Shipped | `20260608001300_engagements.sql` |
| Zod / `EngagementSchema` | ✅ | `packages/shared/src/schemas.ts` |
| Admin override UI (inline) | ✅ Partial | `AdminEnrolStudentModal`, `StepClass`, `StepSelectStudent`, `EnrolmentStepper` |
| `show_all_classes` toggle | ✅ | Admin modal + `StepClass` |
| i18n keys (override, show all) | ✅ | `pages.enrolment.*` in `en.json` / `he.json` |
| Server: authenticated create + admin check | ✅ | `EnrolmentService.create` |
| Server: checkout edge path + admin check | ✅ | `resolve-or-create-engagement.ts` + `assertAdminAgeOverride` |
| Reusable `AgeOverridePanel` | ❌ | Logic duplicated inline — extract in PR A |
| Shared `ageEnrolmentPolicy` module | ❌ | Logic scattered across components |
| `age_at_season_start` snapshot on create | ❌ | Column exists; never populated |
| Audit log on override | ❌ | `BaseService.logAudit` is no-op; no RPC audit |
| Unit tests for policy | ❌ | No `ageEnrolmentPolicy.test.ts` |
| **Guest age bypass** | ❌ **Security gap** | `guest_enrolment_create_engagement` inserts without age check |
| Parent review request UI | ❌ | No `AgeReviewRequestForm` |
| Review / approve / decline RPCs | ❌ | None exist |
| Admin review panel + deep link | ❌ | `/admin/students?engagement=` not handled |
| Email templates (3) | ❌ | Not registered in `send-notification` |
| Override badge on enrolment rows | ❌ | `EnrolmentRowActions` |

---

## Locked decisions (unchanged)

- Age reference date = **season `start_date`** (`check-requirements.ts`).
- Override UI/API is **admin-only** — never expose override checkbox to guest/parent.
- Admin override status = **`pending_payment`** (not `admin_review`).
- Parent request status = **`admin_review`** — no checkout until admin approves.
- On **approve**, set `age_override_*` columns (approval = documented exception); transition → `pending_payment`.
- Parent note on review request: **required**, min 10 chars.
- Admin email deep link: `/admin/students?engagement={engagementId}` (login required; no magic link).
- V1 admin notification: all `tenant_admin` users for tenant.
- V1: admin email on submit only; parent email on approve/decline (defer parent email on submit).

---

## PR A — Harden admin override (ship first)

**Paste-ready plan:** [age-override-pr-a.md](age-override-pr-a.md)

**Goal:** Close gaps in the admin path before building parent review. No new user-facing parent features.

### A1 — Shared age policy module

| File | Action |
| --- | --- |
| `apps/web/src/features/enrolment/lib/ageEnrolmentPolicy.ts` | **New** — `AgeEnrolmentActor`, `evaluateAgeEnrolment`, `shouldBlockAgeEnrolment` |
| `selectedClassAgeValidation.tsx` | Refactor to use policy; add optional `actor` prop |
| `filterStudentCandidates.ts` | Pass `actor: 'parent'` / `'admin'` |
| `EnrolmentStepper.tsx`, `AdminEnrolStudentModal.tsx` | Pass actor from `enrolmentContext.mode` |

### A2 — Extract `AgeOverridePanel`

| File | Action |
| --- | --- |
| `apps/web/src/features/enrolment/components/AgeOverridePanel.tsx` | **New** — warning, checkbox, reason textarea |
| Replace inline blocks in | `AdminEnrolStudentModal`, `StepClass`, `StepSelectStudent`, `EnrolmentStepper` |

### A3 — Populate `age_at_season_start` + audit

| File | Action |
| --- | --- |
| `EnrolmentService.create` | Set `age_at_season_start` whenever age can be computed |
| `resolve-or-create-engagement.ts` | Same snapshot on insert |
| **Migration** `20260626000100_age_engagement_rpcs.sql` | Add shared SQL helper `engagement_age_at_season_start(person_id, offering_id)`; optional `log_audit` INSERT in future RPCs (PR B) |

Do **not** add a standalone migration for columns — they already exist in `01300`.

### A4 — Close guest bypass (age check only)

| File | Action |
| --- | --- |
| `guest_enrolment_create_engagement` in `20260608002100_guest_enrolment_rpcs.sql` | **New migration** amends function: reject ineligible age with `AGE_INELIGIBLE` (does not allow override — guests must use review RPC in PR B) |

Use `CREATE OR REPLACE` in `20260626000100_age_engagement_rpcs.sql` (never edit shipped migration in place).

### A5 — Tests

| File | Cases |
| --- | --- |
| `apps/web/src/__tests__/ageEnrolmentPolicy.test.ts` | **New** — guest blocked, admin blocked without override, admin allowed with override, parent blocked |
| Extend `check-requirements.test.ts` if present | Season-start edge cases unchanged |

### PR A — Definition of done

- [ ] Admin override works end-to-end with `age_at_season_start` populated
- [ ] Guest cannot create ineligible engagement via `guest_enrolment_create_engagement`
- [ ] Non-admin cannot pass `age_override_confirmed` via API (403)
- [ ] Policy module is single source for UI block decisions
- [ ] `pnpm -C apps/web test`, `pnpm run lint`, `pnpm run build` pass

---

## PR B — Parent review request + admin workflow

**Paste-ready plan:** [age-override-pr-b.md](age-override-pr-b.md) · **Requires PR A merged.**

**Goal:** Parent/guest can request review; admin approves or declines; emails fire. Still **no payment work** except linking to existing pay flow after approve.

### B1 — RPCs (migration `20260626000100` or `20260626000200`)

Prefer one migration file for all age RPCs if PR A already used `26000100`.

| RPC | Purpose |
| --- | --- |
| `request_age_review_engagement(p_person_id, p_offering_id, p_season_id, p_note TEXT)` | Authenticated parent/guardian; inserts `admin_review` |
| `guest_enrolment_request_age_review(p_subdomain, p_student_person_id, p_offering_id, p_season_id, p_note TEXT)` | Guest path; same validation |
| `approve_age_review_engagement(p_engagement_id, p_admin_reason TEXT DEFAULT NULL)` | Admin only; sets override cols; `admin_review` → `pending_payment` |
| `decline_age_review_engagement(p_engagement_id, p_reason TEXT DEFAULT NULL)` | Admin only; → `cancelled`, `cancellation_reason = 'age_review_declined'` |

Shared validation (all RPCs):

1. Load offering min/max + season start; compute age.
2. Reject if age **is** eligible (`AGE_ELIGIBLE` — no review needed).
3. Reject if age ineligible and caller tries wrong path (override vs review).
4. Set `age_at_season_start`, `age_review_note` on review insert.
5. `INSERT INTO audit_log` inside RPC (match `cancel_engagement` pattern in `20260608002300`).

**RLS note:** Parent INSERT policy only allows `pending_payment`. Review requests **must** go through SECURITY DEFINER RPCs (same as guest intake).

### B2 — Parent / guest UI

| File | Action |
| --- | --- |
| `AgeReviewRequestForm.tsx` | **New** — note field (min 10 chars), submit, success state |
| `selectedClassAgeValidation.tsx` | Extend `SelectedClassAgeAlert` with secondary CTA when `actor !== 'admin'` |
| `StepSelectStudent.tsx` | Embed review form on blocked pre-selected class |
| `EnrolmentStepper.tsx` | Sub-state `reviewSubmitted`; block checkout after review |
| `intakeService.ts` / `onboardingService.ts` | `requestAgeReview()` wrappers for guest + authenticated |

Flow change (guest, pre-selected class):

```
Today:  family created → checkout guard blocks
After:  family created → age blocked → AgeReviewRequestForm → RPC → confirmation (no checkout)
```

### B3 — Admin approve / decline UI

| File | Action |
| --- | --- |
| `AgeReviewAdminPanel.tsx` | **New** — student, class, ages, parent note, Approve / Decline |
| `StudentsList.tsx` | Read `?engagement=` from URL; open slide-over / highlight row |
| `StudentSlideOver.tsx` | Render panel when `status === 'admin_review'` |
| `EnrolmentRowActions.tsx` | Badge: "Age exception" when `age_override_at` set; highlight `admin_review` |

### B4 — Email notifications

| Template | Recipient | Trigger |
| --- | --- | --- |
| `enrolment_age_review_requested` | tenant admins | Review RPC success |
| `enrolment_age_review_approved` | guardian email | Approve RPC |
| `enrolment_age_review_declined` | guardian email | Decline RPC |

| File | Action |
| --- | --- |
| `packages/shared/src/email-templates/` | 3 new React email components |
| `packages/shared/src/i18n/email-templates-*.json` | Strings |
| `supabase/functions/send-notification/index.ts` | Register template names |
| Trigger | After RPC success: app or RPC invokes `send-notification` with admin emails from `user_profiles` |

Run `pnpm email:bundle` after template changes.

**Approve email:** include link to existing enrol/pay path for the engagement (reuse patterns from admin enrolment link — no new payment integration).

### B5 — i18n (app UI)

Add keys under `pages.enrolment.*`:

- `age_review_request_button`, `age_review_note_label`, `age_review_note_placeholder`
- `age_review_submitted_title`, `age_review_submitted_body`
- `age_review_admin_title`, `age_review_approve`, `age_review_decline`
- `age_exception_badge`

EN + HE must match structure.

### PR B — Definition of done

- [ ] Guest/parent sees "Request studio review" (not override) when age-blocked
- [ ] Submit creates `admin_review` engagement; no checkout step
- [ ] Admin email with working `/admin/students?engagement=` link
- [ ] Approve → `pending_payment` + parent email with pay link
- [ ] Decline → `cancelled` + parent email
- [ ] Manual smoke matrix (below) passes

---

## Deploy order

1. Migration(s) → `pnpm db:push` (hosted dev) or `pnpm db:reset-and-types:local`
2. `pnpm db:types:all`
3. `pnpm -C packages/shared build`
4. Edge functions (if `resolve-or-create-engagement` changed in PR A)
5. `pnpm email:bundle` (PR B only)
6. Web app

---

## Manual smoke matrix

### Admin override (PR A)

- [ ] Admin enrol modal: eligible class → no override needed
- [ ] Admin selects ineligible class → override required to proceed
- [ ] Override creates engagement with `age_override_at`, `age_at_season_start`
- [ ] Parent/guest devtools override flag → 403 / error

### Parent review (PR B)

- [ ] Guest: pre-selected class + ineligible DOB → review form (not override)
- [ ] Submit → success; no checkout
- [ ] Admin email → opens student with review panel
- [ ] Approve → parent email; engagement payable
- [ ] Decline → cancelled; parent notified

### Regression

- [ ] Eligible parent enrolment unchanged
- [ ] Class picker age filtering still uses season start
- [ ] Unenrol Phase 1 cancel still works on `pending_payment` / `admin_review`

---

## File checklist

| PR | New | Modified |
| --- | --- | --- |
| A | `ageEnrolmentPolicy.ts`, `AgeOverridePanel.tsx`, `ageEnrolmentPolicy.test.ts`, `20260626000100_age_engagement_rpcs.sql` | `selectedClassAgeValidation.tsx`, `EnrolmentService`, `resolve-or-create-engagement.ts`, enrolment components |
| B | `AgeReviewRequestForm.tsx`, `AgeReviewAdminPanel.tsx`, 3 email templates, `20260626000200_age_review_rpcs.sql` (if split) | `StepSelectStudent`, `EnrolmentStepper`, `StudentsList`, `StudentSlideOver`, `intakeService`, `send-notification`, i18n |

---

## Acceptance criteria (full feature)

1. **Admin-only override** — UI only when `mode === 'admin'`; server rejects non-admin override.
2. **Audit trail** — `age_override_*` on override or approval; `age_at_season_start` on all age-gated creates.
3. **Parent request** — `admin_review` engagement; admin emailed; no payment until approved.
4. **Single policy module** — no scattered admin bypass in components.
5. **Season-start age** — all checks use season start, not today.
6. **Guest bypass closed** — guest create engagement validates age; review goes through dedicated RPC.

---

## Agent session hints

- Read `20260608002300_engagement_actions.sql` (`cancel_engagement`) for RPC + audit pattern.
- Read `20260608002100_guest_enrolment_rpcs.sql` before guest review RPC.
- Read `docs/plans/admin-enrolment-completion-link.md` for post-approve pay link patterns.
- **Do not** touch payment provider settings, Grow, or checkout amount logic.
- Wait for user approval of this plan before coding.
