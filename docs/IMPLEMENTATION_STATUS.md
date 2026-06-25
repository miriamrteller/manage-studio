# Implementation status

Living checklist for in-flight SPEC features. Normative design remains in [SPEC.md](../SPEC.md).

| Feature | Plan | Schema | App code | Notes |
| ------- | ---- | ------ | -------- | ----- |
| VAT pricing consistency | [2026-06-02-vat-pricing.md](plans/2026-06-02-vat-pricing.md) | ✅ | ✅ | Run `pnpm email:bundle` before deploy |
| Phase D — label display wiring | [phase-d-display-wiring.md](plans/phase-d-display-wiring.md) | ✅ | ✅ Complete | |
| Tenant settings hub | [tenant-settings-hub.md](plans/tenant-settings-hub.md) | ✅ | ✅ `/admin/setup/settings` | |
| V3.0 operator onboarding | [v3-0-operator-onboarding-wizard.md](plans/v3-0-operator-onboarding-wizard.md) | ✅ | ✅ `/platform/onboard` | Scaffold |
| Offering `location` | SPEC §4.2.5 | ✅ `00500`, `01800` | ✅ | Admin, public, portal, enrolment, email |
| Unenrol Phase 1 (pre-payment cancel) | [2026-06-02-unenrol-phase-1.md](plans/2026-06-02-unenrol-phase-1.md) | ✅ `02300` | ✅ | `cancel_engagement` + admin UI |
| Admin dashboard finance (F1–F6) | [admin-dashboard-finance/00-overview.md](plans/admin-dashboard-finance/00-overview.md) | ✅ `250001`, `250002` | ✅ | Hub, payments log, expenses, P&L, CSV |
| Finance baseline (Stages 1–9) | [finance/00-overview.md](plans/finance/00-overview.md) | ✅ `01600` + extensions | ✅ | Provider abstraction, mock/Stripe/GI adapters |
| Grow extension (G0–G6) | [finance/00-overview.md](plans/finance/00-overview.md) | ✅ `250003`–`250006` | ✅ | Gaps 1–5 closed; Grow registry, webhooks, checkout shell, admin docs RPCs |
| Grow G7 settings + verify | [finance/stage-g7-settings-cleanup.md](plans/finance/stage-g7-settings-cleanup.md) | ✅ | ✅ code | `GrowSettingsForm`, `verify-grow-credentials`, `FinanceHealthCard` — **live sandbox E2E still manual** |
| **Age override (PR A)** | [age-override-pr-a.md](plans/age-override-pr-a.md) | ✅ `260001` | ✅ **Complete** | Policy module, panel, snapshot, guest age gate, tests |
| **Parent age review (PR B)** | [age-override-pr-b.md](plans/age-override-pr-b.md) | ✅ `260002` | 🟡 **~65%** | Backend + components done; **UI wiring + i18n + admin deep link incomplete** |
| Code rename epic (ex-D5) | [code-rename-epic.md](plans/code-rename-epic.md) | — | — | Deferred |

**Last updated:** 2026-06-25 (post PR A merge + Grow gap closure + PR B in progress)

---

## Age override / review — detail

### PR A ✅ Complete

| Item | Status |
| --- | --- |
| `ageEnrolmentPolicy.ts` + tests | ✅ |
| `AgeOverridePanel.tsx` | ✅ |
| `age_at_season_start` on create (web + edge) | ✅ |
| `20260626000100` helper + guest age gate | ✅ |

### PR B 🟡 In progress (~65%)

| Item | Status |
| --- | --- |
| `20260626000200` review/approve/decline RPCs | ✅ |
| `intakeService.requestAgeReview` / `requestGuestAgeReview` | ✅ |
| `ageReviewService`, `sendAgeReviewNotifications` | ✅ |
| Email templates + `render-template` + email i18n | ✅ |
| `AgeReviewRequestForm`, `AgeReviewAdminPanel` components | ✅ (built, partially wired) |
| `SelectedClassAgeAlert` + `StepSelectStudent` props | ✅ partial |
| **`EnrolmentStepper` → passes `onSubmitAgeReview`, review confirmation state** | ❌ |
| **`StudentSlideOver` mounts `AgeReviewAdminPanel`** | ❌ |
| **`StudentsList` handles `?engagement=` deep link** | ❌ |
| **App i18n** (`pages.enrolment.age_review_*` in `en.json` / `he.json`) | ❌ missing |
| `EnrolmentRowActions` age exception badge | ❌ |
| Tests + manual smoke | ❌ |

**Finish PR B:** [age-override-pr-b.md](plans/age-override-pr-b.md) Steps 3–9 (wiring only — no new RPCs).

---

## Grow / payments — detail

Merged recently (`feat/grow-gap-closure-v2`, `2026-06-25-f448`):

| Migration | Purpose |
| --- | --- |
| `20260625000300` | Grow webhook secrets (encrypted, rotatable) |
| `20260625000400` | Grow document fields on `payments` |
| `20260625000500` | Admin resend document RPCs |
| `20260625000600` | Tenant Grow config + VAT fields |

Code: Grow payment/invoicing providers, `handle-payment-document`, gap tests, Osek Patur pass-through fix.

**Still manual:** end-to-end charge on real Meshulam sandbox (blocked without registered business / sandbox creds). Use mock + finance walkthrough for dev.

---

## Suggested next work

| Priority | Work | Plan |
| --- | --- | --- |
| **1** | **Finish PR B** — smoke test + mark complete | [age-override-pr-b.md](plans/age-override-pr-b.md) Steps 3–9 (stepper, slide-over, deep link, i18n largely landed — verify E2E) |
| **2** | Phase 1F admin operations overview | [admin-overview-dashboard.md](plans/admin-overview-dashboard.md) |
| **3** | Notification blast composer | [notification-blast-composer.md](plans/notification-blast-composer.md) |
| **4** | Parent portal polish (contact prefs + upcoming) | [parent-portal-polish.md](plans/parent-portal-polish.md) |
| **5** | Teachers admin CRUD | [teachers-admin-module.md](plans/teachers-admin-module.md) |
| Optional | Grow live sandbox E2E | [grow-live-e2e-verification.md](plans/grow-live-e2e-verification.md) |
| Deferred | Unenrol Phase 2/3 (refunds), code rename epic | Payment-heavy or low urgency |
