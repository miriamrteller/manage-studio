# Implementation status

Living checklist for in-flight SPEC features. Normative design remains in [SPEC.md](../SPEC.md).

**Last updated:** 2026-06-25 (codebase audit — PR B wiring verified on WIP branch)

---

## V1 phase progress (SPEC §6)

Rough completion against [SPEC.md §6 V1 Implementation](../SPEC.md#6-v1-implementation). Not a hour estimate — feature presence only.

| Phase | Scope | ~Done | Remaining |
| --- | --- | --- | --- |
| **1A–1B** | Skeleton, auth, tenant context | ✅ ~95% | A11y CI gates, polish |
| **1C** | People, families, classes, enrolment, waivers | ✅ ~90% | Teachers admin UI; class occupancy view |
| **1D** | Notifications engine | 🟡 ~60% | Blast composer UI; WhatsApp E2E |
| **1E** | Payments (Stripe + Grow) | 🟡 ~85% | Live Grow sandbox E2E; dunning cron hardening |
| **1F** | Admin dashboard | 🟡 ~65% | Operations overview; notification blast; people CSV export |
| **1G** | Parent / student portal | 🟡 ~70% | Contact prefs in portal; WhatsApp verify; upcoming sessions |
| **§7** | Production deployment | ❌ ~10% | Webhooks, Meta templates, legal, security checklist |
| **§8+** | V2 / V3 | — | Deferred |

**Overall V1 feature scope:** ~**78%** shipped · **Production-ready:** separate track (§7).

---

## Feature tracker

| Feature | Plan | Schema | App code | Notes |
| ------- | ---- | ------ | -------- | ----- |
| VAT pricing consistency | [2026-06-02-vat-pricing.md](plans/2026-06-02-vat-pricing.md) | ✅ | ✅ | Run `pnpm email:bundle` before deploy |
| Phase D — label display wiring | [phase-d-display-wiring.md](plans/phase-d-display-wiring.md) | ✅ | ✅ | Complete |
| Tenant settings hub | [tenant-settings-hub.md](plans/tenant-settings-hub.md) | ✅ | ✅ | `/admin/setup/settings` |
| V3.0 operator onboarding | [v3-0-operator-onboarding-wizard.md](plans/v3-0-operator-onboarding-wizard.md) | ✅ | ✅ | Scaffold at `/platform/onboard` |
| Offering `location` | SPEC §4.2.5 | ✅ | ✅ | Admin, public, portal, enrolment, email |
| Unenrol Phase 1 (pre-payment cancel) | [2026-06-02-unenrol-phase-1.md](plans/2026-06-02-unenrol-phase-1.md) | ✅ `02300` | ✅ | `cancel_engagement` + admin UI |
| Admin dashboard finance (F1–F6) | [admin-dashboard-finance/00-overview.md](plans/admin-dashboard-finance/00-overview.md) | ✅ `250001`, `250002` | ✅ | Hub, payments log, expenses, P&L, CSV |
| Finance baseline (Stages 1–9) | [finance/00-overview.md](plans/finance/00-overview.md) | ✅ `01600` + extensions | ✅ | Provider abstraction, mock/Stripe/GI adapters |
| Grow extension (G0–G6) | [finance/00-overview.md](plans/finance/00-overview.md) | ✅ `250003`–`250006` | ✅ | Registry, webhooks, checkout shell, admin doc RPCs |
| Grow G7 settings + verify | [finance/stage-g7-settings-cleanup.md](plans/finance/stage-g7-settings-cleanup.md) | ✅ | ✅ | `GrowSettingsForm`, `verify-grow-credentials`, `FinanceHealthCard` — **live sandbox E2E still manual** |
| **Age override (PR A)** | [age-override-pr-a.md](plans/age-override-pr-a.md) | ✅ `260001` | ✅ | Policy module, panel, snapshot, guest age gate, tests |
| **Parent age review (PR B)** | [age-override-pr-b.md](plans/age-override-pr-b.md) | ✅ `260002` | 🟡 **~95%** | **Code complete on WIP branch** — merge pending bug fixes + manual E2E smoke |
| Phase 1F admin operations overview | [admin-overview-dashboard.md](plans/admin-overview-dashboard.md) | ❌ | ❌ | `useAdminDashboard` still placeholder |
| Notification blast composer | [notification-blast-composer.md](plans/notification-blast-composer.md) | ❌ | ❌ | `send-notification` exists; no compose UI |
| Parent portal polish (Phase 1G) | [parent-portal-polish.md](plans/parent-portal-polish.md) | — | ❌ | `ContactPreferencesEditor` built, not in portal |
| Teachers admin module | [teachers-admin-module.md](plans/teachers-admin-module.md) | ✅ `staff` | ❌ | `TeacherService` / `useTeachers` only — no admin page |
| Code rename epic (ex-D5) | [code-rename-epic.md](plans/code-rename-epic.md) | — | — | Deferred |

---

## Age override / review — detail

### PR A ✅ Complete

| Item | Status |
| --- | --- |
| `ageEnrolmentPolicy.ts` + tests | ✅ |
| `AgeOverridePanel.tsx` | ✅ |
| `age_at_season_start` on create (web + edge) | ✅ |
| `20260626000100` helper + guest age gate | ✅ |

### PR B 🟡 ~95% (WIP branch — merge pending)

| Item | Status |
| --- | --- |
| `20260626000200` review/approve/decline RPCs | ✅ |
| `intakeService.requestAgeReview` / `requestGuestAgeReview` | ✅ |
| `ageReviewService`, `sendAgeReviewNotifications` | ✅ |
| Email templates + `render-template` + email i18n | ✅ |
| `AgeReviewRequestForm`, `AgeReviewAdminPanel` | ✅ |
| `SelectedClassAgeAlert` + `StepSelectStudent` review path | ✅ |
| `EnrolmentStepper` → `onSubmitAgeReview`, review confirmation | ✅ |
| `StudentSlideOver` mounts `AgeReviewAdminPanel` | ✅ |
| `StudentsList` handles `?engagement=` deep link + highlight | ✅ |
| App i18n (`pages.enrolment.age_review_*`, `age_exception_badge`) | ✅ EN + HE |
| `EnrolmentRowActions` age exception badge | ✅ |
| Unit tests (`ageReviewRequest.test.ts`, `ageEnrolmentPolicy.test.ts`) | ✅ |
| **Manual E2E smoke** (guest/parent request → admin email → approve/decline) | ⏳ **Pending** |
| **Bug fixes on WIP branch** | ⏳ **In progress** (user) |

**Before merge:** run manual smoke from [age-override-pr-b.md](plans/age-override-pr-b.md) Step 9.

---

## Grow / payments — detail

| Migration | Purpose |
| --- | --- |
| `20260625000300` | Grow webhook secrets (encrypted, rotatable) |
| `20260625000400` | Grow document fields on `payments` |
| `20260625000500` | Admin resend document RPCs |
| `20260625000600` | Tenant Grow config + VAT fields |

Code: Grow payment/invoicing providers, `handle-payment-document`, gap tests, Osek Patur pass-through fix.

**Still manual:** end-to-end charge on real Meshulam sandbox. Dev path: `GROW_MOCK=true` + finance walkthrough. Plan: [grow-live-e2e-verification.md](plans/grow-live-e2e-verification.md).

---

## Phase 1F / 1G — gaps without agent plans yet

Items in SPEC but not yet planned as standalone agent chats:

| Item | SPEC | Code today |
| --- | --- | --- |
| People directory CSV export | Phase 1F — People | ❌ Students list has no export |
| Classes occupancy + waitlist bar | Phase 1F — Classes | 🟡 Capacity column only; no enrolled/waitlist counts |
| WhatsApp blast (urgent) | Phase 1F — Notifications | ❌ |
| WhatsApp OTP verify in portal | Phase 1G | ❌ Edge fn exists; no portal UI |
| `notify_*` scope toggles | Phase 1G | ❌ DB columns exist; schema/editor omit them |
| Payment dunning (Day 3/7/14) | Phase 1E timeline | 🟡 Templates + `run-monthly-billing`; full journey not verified |

---

## §6.x deferred backlog (intentionally post–V1 slice)

Track in SPEC §6.x — pull into V1 only when explicitly prioritized:

1. Guest checkout  
2. Stripe Connect  
3. `discount_rules` at checkout  
4. Per-tenant Twilio/Resend  
5. Multi-region  
6. **Unenrol Phase 2** — post-payment withdrawal + refund wizard  
7. **Unenrol Phase 3** — parent withdrawal requests (depends on Phase 1G)

**Shipped:** Unenrol Phase 1 (pre-payment cancel).

---

## Suggested next work

| Priority | Work | Plan |
| --- | --- | --- |
| **0** | **Merge PR B** after bug fixes + manual E2E smoke | [age-override-pr-b.md](plans/age-override-pr-b.md) Step 9 |
| **1** | Phase 1F admin operations overview | [admin-overview-dashboard.md](plans/admin-overview-dashboard.md) |
| **2** | Grow live sandbox E2E (WIP branch / when creds ready) | [grow-live-e2e-verification.md](plans/grow-live-e2e-verification.md) |
| **3** | Notification blast composer | [notification-blast-composer.md](plans/notification-blast-composer.md) |
| **4** | Parent portal polish | [parent-portal-polish.md](plans/parent-portal-polish.md) |
| **5** | Teachers admin CRUD | [teachers-admin-module.md](plans/teachers-admin-module.md) |
| **6** | Unenrol Phase 2 (refunds) — now in scope if desired | No plan yet |
| Later | §7 production deployment checklist | [SPEC.md §7](../SPEC.md#7-v1-production-deployment) |
| Deferred | Code rename epic, V2 features | [code-rename-epic.md](plans/code-rename-epic.md) · SPEC §8 |
