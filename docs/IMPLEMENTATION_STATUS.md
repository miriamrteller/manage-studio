# Implementation status

Living checklist for in-flight SPEC features. Normative design remains in [SPEC.md](../SPEC.md).

**Last updated:** 2026-07-05 (Payment dunning V1 architecture locked in plans)

---

## V1 phase progress (SPEC §6)

Rough completion against [SPEC.md §6 V1 Implementation](../SPEC.md#6-v1-implementation). Not a hour estimate — feature presence only.

| Phase | Scope | ~Done | Remaining |
| --- | --- | --- | --- |
| **1A–1B** | Skeleton, auth, tenant context | ✅ ~95% | A11y CI gates, polish |
| **1C** | People, families, classes, enrolment, waivers | ✅ ~95% | Classes list occupancy bar (overview ✅); teachers admin → V2.11 |
| **1D** | Notifications engine | 🟡 ~90% | WhatsApp E2E |
| **1E** | Payments (Stripe + Grow + iCount mock) | 🟡 ~88% | Live Grow sandbox E2E; iCount I0-live+; dunning cron hardening |
| **1F** | Admin dashboard | ✅ ~95% | Operations overview ✅ (PR #5); people CSV export |
| **1G** | Parent / student portal | ✅ ~92% | WhatsApp OTP verify in portal; `notify_*` scope toggles (1G-b) |
| **§7** | Production deployment | ❌ ~10% | Webhooks, Meta templates, legal, security checklist |
| **§8+** | V2 / V3 | — | Deferred |

**Overall V1 feature scope:** ~**80%** shipped · **Production-ready:** separate track (§7).

---

## Feature tracker

| Feature | Plan | Schema | App code | Notes |
| ------- | ---- | ------ | -------- | ----- |
| VAT / gross pricing | [2026-06-02-vat-pricing.md](plans/2026-06-02-vat-pricing.md) | ✅ | ✅ | **Refactored 2026-06-28:** `resolveOfferingPrice` gross-only; VAT on tax documents via Grow/GI — not app-split |
| Phase D — label display wiring | [phase-d-display-wiring.md](plans/phase-d-display-wiring.md) | ✅ | ✅ | Complete |
| Tenant settings hub | [tenant-settings-hub.md](plans/tenant-settings-hub.md) | ✅ | ✅ | `/admin/setup/settings` |
| V3.0 operator onboarding | [v3-0-operator-onboarding-wizard.md](plans/v3-0-operator-onboarding-wizard.md) | ✅ | ✅ | Scaffold at `/platform/onboard` |
| Admin nav (finance + families) | — | — | ✅ | Finance sub-nav, `/admin/families`, Grow vs non-Grow setup filters (`2ed53c6`) |
| Offering `location` | SPEC §4.2.5 | ✅ | ✅ | Admin, public, portal, enrolment, email |
| Unenrol Phase 1 (pre-payment cancel) | [2026-06-02-unenrol-phase-1.md](plans/2026-06-02-unenrol-phase-1.md) | ✅ `02300` | ✅ | `cancel_engagement` + admin UI |
| Admin dashboard finance (F1–F6) | [admin-dashboard-finance/00-overview.md](plans/admin-dashboard-finance/00-overview.md) | ✅ `250001`, `250002` | ✅ | Hub, payments log, expenses, P&L, CSV |
| Finance baseline (Stages 1–9) | [finance/00-overview.md](plans/finance/00-overview.md) | ✅ `01600` + extensions | ✅ | Provider abstraction, mock/Stripe/GI adapters |
| Grow extension (G0–G6) | [finance/00-overview.md](plans/finance/00-overview.md) | ✅ consolidated | ✅ | Grow fields merged into `01600` / `00200`; dropped redundant `250004`/`250006` migrations |
| Grow G7 settings + verify | [finance/stage-g7-settings-cleanup.md](plans/finance/stage-g7-settings-cleanup.md) | ✅ | ✅ | `GrowSettingsForm`, `verify-grow-credentials`, `FinanceHealthCard` — **live sandbox E2E still manual** |
| **iCount extension (I0–I4a mock)** | [finance/icount/00-overview.md](plans/finance/icount/00-overview.md) | ✅ `01600` / `00200` | ✅ | Mock-phase complete: `IcountSettingsForm`, bundled checkout, IPN/document adapters, `ICOUNT_MOCK` — **I0-live, I5 default flip deferred** |
| Notification log viewer | [notification-log-page.md](plans/notification-log-page.md) | ✅ | ✅ | `NotificationLog` mounted on `/admin/notifications` History tab; full i18n (EN + HE), Template column, `sent_at ?? created_at` date |
| **Age override (PR A)** | [archive/age-override-pr-a.md](plans/archive/age-override-pr-a.md) | ✅ `260001` | ✅ | Policy module, panel, snapshot, guest age gate, tests |
| **Parent age review (PR B)** | [age-override-pr-b.md](plans/age-override-pr-b.md) | ✅ `260002` | ✅ | Shipped `baa6dd1` — **manual E2E smoke recommended** before prod |
| **Parent self-enrolment (P1–P3)** | [parent-self-enrolment/00-overview.md](plans/parent-self-enrolment/00-overview.md) | — | ✅ | `resolveGuardianProfile`, portal **Myself**, `GuardianProfileSetupPanel` (`f0c327a`) |
| **Phase 1F admin operations overview** | [admin-overview-dashboard.md](plans/admin-overview-dashboard.md) | ✅ `20260626000300` | ✅ | RPC, service, hook, 6 components, 7 tests, i18n — **PR #5 complete** |
| Notification blast composer | [notification-blast-composer.md](plans/notification-blast-composer.md) | ✅ `60701000100` | ✅ | `/admin/notifications`, preview RPC, `admin_blast` send, `AdminAnnouncementEmail`, schema tests — **manual Resend smoke recommended** |
| Parent portal polish (Phase 1G) | [parent-portal-polish.md](plans/parent-portal-polish.md) | — | ✅ | Merged PR #8 (`0ea9004`, includes `fcad476`): prefs modal, upcoming 7-day, i18n, `returnTo`, login password, adult DOB display, form submit fixes; **Step 7 `notify_*`** + **Step 8 WhatsApp OTP** deferred |
| **Guest checkout + guest enrolment** | [2026-06-02-guest-enrollment-portal-provisioning.md](plans/2026-06-02-guest-enrollment-portal-provisioning.md) | ✅ `guest_enrolment_*` | ✅ | `/enrol` no login gate; `create-enrolment-intake`; `resolveCheckoutSession` JWT or `enrolment_token`; admin payment link reuses `PAYMENT_REMINDER` |
| Teachers admin module (V2.11) | [teachers-admin-module.md](plans/teachers-admin-module.md) | ✅ `staff` | 🟡 partial | **Deferred V2.11** — `TeacherService` / `useTeachers` + class-form `staff_id`; no admin page |
| **Payment dunning — collections layer + renewal emails** | [payment-dunning-notifications.md](plans/payment-dunning-notifications.md) | 🟡 migration `20260705000100` | 🟡 partial | V1 arch: obligation on domain row + `_shared/collections/` + `notification_log.dunning_key`. Renewal ladder ✅; emails + migration ❌ |
| **Enrolment unpaid dunning (§6.x #8)** | [enrolment-payment-dunning.md](plans/enrolment-payment-dunning.md) | columns in `20260705000100` | ❌ | **Ready** after collections PR — cron Day 3/7/14 |
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

### PR B ✅ Complete (code)

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
| **Manual E2E smoke** (request → email → approve/decline → pay) | ⏳ Recommended before prod |

---

## Parent self-enrolment (P1–P3) — detail ✅

Shipped on `feat/UI-fixes` (`f0c327a`):

| Item | Status |
| --- | --- |
| `resolveGuardianProfile.ts` (canonical resolution) | ✅ |
| Portal **Myself** (`GuardianSelfSection`, `useParentPortal`) | ✅ |
| Enrolment safety net (`GuardianProfileSetupPanel`, `guardianSetupRequired`) | ✅ |
| `ensureGuardianPersonForParent` / DOB update | ✅ |
| Tests (`guardian-profile-setup`, `parent-portal-guardian`) | ✅ |

**Still separate:** [parent-portal-polish.md](plans/parent-portal-polish.md) Step 8 — full `WhatsAppOtpVerifier` i18n + portal embed; Step 7 — optional 1G-b `notify_*` toggles.

---

## Parent portal polish (Phase 1G) — detail ✅

Merged to `main` via PR #8 (`0ea9004`; core work in `fcad476`):

| Item | Status |
| --- | --- |
| Notification preferences modal (EN + HE, verify hint) | ✅ |
| Upcoming sessions (7-day, `buildUpcomingSessions` + tests) | ✅ |
| `EnrolmentRow` dynamic `returnTo` | ✅ |
| Portal login password (`SetPasswordDialog`) | ✅ |
| Adult DOB display (`formatPersonDateOfBirthDisplay`) | ✅ |
| Form submit safety (`bindFormSubmit`, prefs cache update) | ✅ |
| Regtest (build + lint + a11y e2e) | ✅ 2026-06-30 |
| **Manual portal smoke** (Step 6 checklist) | ⏳ Recommended before prod |
| **Step 7 — `notify_*` scope toggles (1G-b)** | ❌ Deferred — [Step 7](plans/parent-portal-polish.md#step-7--optional-phase-1g-b-notify_-toggles) |
| **Step 8 — WhatsApp OTP verify in portal** | 🟡 Hint only — [Step 8](plans/parent-portal-polish.md#step-8--whatsapp-otp-verify-in-portal-deferred) |

---

## Grow / iCount / payments — detail

| Migration | Purpose |
| --- | --- |
| `20260625000300` | Grow webhook secrets (encrypted, rotatable) |
| `20260625000500` | Admin resend document RPCs |
| `20260608001600` (+ edits) | Payments + Grow/iCount document columns + credential RPCs (consolidated) |
| `20260608000200` (+ edits) | Tenant payment provider columns |

**Grow:** payment/invoicing providers, `handle-payment-document`, gap tests, Osek Patur pass-through fix.

**iCount (mock-phase ✅):** `_shared/payments/icount/` (mock-api, ipn, document), `providers/icount.ts`, `IcountSettingsForm` in bundled payments, provider-isolation tests. Dev path: `ICOUNT_MOCK=true`. Plan: [finance/icount/00-overview.md](plans/finance/icount/00-overview.md). **Deferred:** I0-live sandbox, live renewals/refunds, I5 IL default flip.

**VAT (2026-06-28):** App charges **gross** offering price; pretax/VAT split removed from `packages/shared/src/pricing.ts`. Israeli tax breakdown comes from Grow/Green Invoice/iCount on issued documents.

**Still manual:** end-to-end charge on real Meshulam sandbox (Grow) and iCount sandbox (I0-live block). Dev paths: `GROW_MOCK=true` / `ICOUNT_MOCK=true` + finance walkthrough. Plan: [grow-live-e2e-verification.md](plans/grow-live-e2e-verification.md).

---

## Phase 1F / 1G — gaps without dedicated plans

| Item | SPEC | Code today |
| --- | --- | --- |
| People directory CSV export | Phase 1F — People | ❌ |
| Admin overview occupancy bar | Phase 1F — Dashboard | ✅ `OccupancyBar` on today's classes table |
| Classes list occupancy + waitlist bar | Phase 1F — Classes | 🟡 `AdminClassesList` shows capacity number only |
| Notification log page | Phase 1F — Notifications | ✅ Mounted on `/admin/notifications` History tab |
| WhatsApp blast (urgent) | Phase 1F — Notifications | ❌ Deferred (Twilio) |
| Contact prefs in portal | Phase 1G | ✅ |
| Upcoming sessions (7-day) | Phase 1G | ✅ |
| WhatsApp OTP verify in portal | Phase 1G | 🟡 Hint only; full OTP flow deferred |
| `notify_*` scope toggles | Phase 1G | ❌ DB yes; schema/editor no (1G-b deferred) |
| Payment dunning (renewal ladder + emails) | Phase 1E | 🟡 Ladder ✅; collections + emails ❌ — [payment-dunning-notifications.md](plans/payment-dunning-notifications.md) |
| Enrolment unpaid dunning cron | §6.x #8 | ❌ Agent-ready plan — [enrolment-payment-dunning.md](plans/enrolment-payment-dunning.md) (after collections PR) |

---

## §6.x deferred backlog (intentionally post–V1 slice)

Track in SPEC §6.x — pull into V1 only when explicitly prioritized:

1. Stripe Connect
2. `discount_rules` at checkout
3. Per-tenant Twilio/Resend
4. Multi-region
5. **Unenrol Phase 2** — post-payment withdrawal + refund wizard
6. **Unenrol Phase 3** — parent withdrawal requests (depends on Phase 1G)
7. **Teachers admin UI** — V2.11 only ([teachers-admin-module.md](plans/teachers-admin-module.md)); not V1
8. **Automated enrolment dunning cron** — `pending_payment` Day 3/7/14 without admin action

**Shipped:** Guest checkout + guest enrolment · Unenrol Phase 1 · Age override + review · Parent self-enrolment (Myself).

---

## Suggested next work

| Priority | Work | Plan / notes |
| --- | --- | --- |
| **0** | Grow live sandbox E2E (when creds ready) | [grow-live-e2e-verification.md](plans/grow-live-e2e-verification.md) |
| **0b** | iCount I0-live sandbox (when creds ready) | [finance/icount/00-overview.md](plans/finance/icount/00-overview.md) I0-live block |
| **1** | Payment dunning — migration + collections + renewal emails | [payment-dunning-notifications.md](plans/payment-dunning-notifications.md) |
| **1b** | Enrolment unpaid dunning cron (after #1) | [enrolment-payment-dunning.md](plans/enrolment-payment-dunning.md) — **ready** |
| **2** | People directory CSV export | SPEC Phase 1F — no plan yet |
| **3** | Classes list occupancy + waitlist bar | SPEC Phase 1F — partial (`AdminClassesList`) |
| **4** | Parent portal Step 8 — WhatsApp OTP verify in prefs modal | [parent-portal-polish.md](plans/parent-portal-polish.md) Step 8 |
| **5** | Parent portal 1G-b — `notify_*` scope toggles (optional) | [parent-portal-polish.md](plans/parent-portal-polish.md) Step 7 |
| **6** | Notification blast manual smoke (Resend) | [notification-blast-composer.md](plans/notification-blast-composer.md) Step 7 |
| **7** | PR B manual E2E smoke (recommended before prod) | [age-override-pr-b.md](plans/age-override-pr-b.md) Step 9 |
| **8** | Parent portal manual smoke (Step 6 checklist) | [parent-portal-polish.md](plans/parent-portal-polish.md) Step 6 |
| **9** | Unenrol Phase 2 (refunds) | No plan yet |
| Later | §7 production deployment checklist | [SPEC.md §7](../SPEC.md#7-v1-production-deployment) |
| **V2.11** | Teachers admin CRUD | [teachers-admin-module.md](plans/teachers-admin-module.md) · [SPEC §8 V2.11](../SPEC.md#v211--teachers-admin-module) |
| Deferred | Code rename epic, other V2 features | [code-rename-epic.md](plans/code-rename-epic.md) · SPEC §8 |
