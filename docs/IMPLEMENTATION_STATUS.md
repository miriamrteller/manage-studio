# Implementation status

Living checklist for in-flight SPEC features. Normative design remains in [SPEC.md](../SPEC.md).

**Last updated:** 2026-07-19

---

## V1 phase progress (SPEC §6)

- Migration chain: **29 files** — squashed `20260608000200`–`20260608002800` (PR #17) + `02900` S5 penalties; prior incrementals under `supabase/migrations_backup/`.

Rough completion against [SPEC.md §6 V1 Implementation](../SPEC.md#6-v1-implementation). Not a hour estimate — feature presence only.

| Phase | Scope | ~Done | Remaining |
| --- | --- | --- | --- |
| **1A–1B** | Skeleton, auth, tenant context | ✅ ~95% | A11y CI gates, polish |
| **1C** | People, families, classes, enrolment, waivers | ✅ ~95% | Teachers admin → V2.11; waitlist automation → V2.2 |
| **1D** | Notifications engine | 🟡 ~90% | WhatsApp E2E (**last**, with live payments) |
| **1E** | Payments (Grow + iCount mock; Invoice4U active plan) | 🟡 ~94% | **Invoice4U** mock U1→U4-mock on `feat/invoice4u-provider` ([OVERNIGHT-AGENT](plans/finance/invoice4u/OVERNIGHT-AGENT.md)) |
| **1F** | Admin dashboard | ✅ ~95% | People CSV + classes occupancy bar → **V2 start** (not V1-blocking) |
| **1G** | Parent / student portal | ✅ ~95% | WhatsApp OTP (**last**); `notify_*` scope toggles ✅ |
| **§7** | Production deployment | ❌ ~10% | Webhooks, Meta templates, legal, security checklist |
| **§8+** | V2 / V3 | — | V2 start: people CSV, classes occupancy bar, V2.2 waitlist, **V2.13 minimal CRM**, **V2.14 holiday-aware scheduling** |

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
| Admin dashboard finance (F1–F6) | [admin-dashboard-finance/00-overview.md](plans/admin-dashboard-finance/00-overview.md) | ✅ `01600` (expenses, `get_finance_summary`) | ✅ | Hub, payments log, expenses, P&L, CSV |
| Finance baseline (Stages 1–9) | [finance/00-overview.md](plans/finance/00-overview.md) | ✅ `01600` (folded incrementals) | ✅ | Provider abstraction, mock/Stripe/GI adapters |
| Grow extension (G0–G6) | [finance/00-overview.md](plans/finance/00-overview.md) | ✅ consolidated | ✅ | Grow fields merged into `01600` / `00200`; dropped redundant `250004`/`250006` migrations |
| Grow G7 settings + verify | [finance/stage-g7-settings-cleanup.md](plans/finance/stage-g7-settings-cleanup.md) | ✅ | ✅ | `GrowSettingsForm`, `verify-grow-credentials`, `FinanceHealthCard` — **live sandbox E2E still manual** |
| **iCount extension (I0–I4a mock)** | [finance/icount/00-overview.md](plans/finance/icount/00-overview.md) | ✅ `01600` / `00200` | ✅ | Mock-phase complete: `IcountSettingsForm`, bundled checkout, IPN/document adapters, `ICOUNT_MOCK` — **I0-live, I5 default flip deferred** |
| Notification log viewer | [notification-log-page.md](plans/notification-log-page.md) | ✅ | ✅ | `NotificationLog` mounted on `/admin/notifications` History tab; full i18n (EN + HE), Template column, `sent_at ?? created_at` date |
| Notification log detail viewer | [notification-log-detail-viewer.md](plans/notification-log-detail-viewer.md) | ✅ | ✅ | Row click / View opens dialog with subject, body, metadata; `otp_code` redacted |
| Notification log recipient search | [notification-log-recipient-search.md](plans/notification-log-recipient-search.md) | ✅ | ✅ | Debounced name/email/phone filter on History tab |
| **Age override (PR A)** | [archive/age-override-pr-a.md](plans/archive/age-override-pr-a.md) | ✅ `02100` | ✅ | Policy module, panel, snapshot, guest age gate, tests |
| **Parent age review (PR B)** | [age-override-pr-b.md](plans/age-override-pr-b.md) | ✅ `02200` | ✅ | Shipped `baa6dd1` — **manual E2E smoke recommended** before prod |
| **Parent self-enrolment (P1–P3)** | [parent-self-enrolment/00-overview.md](plans/parent-self-enrolment/00-overview.md) | — | ✅ | `resolveGuardianProfile`, portal **Myself**, `GuardianProfileSetupPanel` (`f0c327a`) |
| **Phase 1F admin operations overview** | [admin-overview-dashboard.md](plans/admin-overview-dashboard.md) | ✅ `02000` | ✅ | RPC, service, hook, 6 components, 7 tests, i18n — **PR #5 complete** |
| Notification blast composer | [notification-blast-composer.md](plans/notification-blast-composer.md) | ✅ `00600` | ✅ | `/admin/notifications`, preview RPC, `admin_blast` send, `AdminAnnouncementEmail`, schema tests — **manual Resend smoke recommended** |
| Parent portal polish (Phase 1G) | [parent-portal-polish.md](plans/parent-portal-polish.md) | — | ✅ | Merged PR #8; **Step 7 `notify_*` ✅** (2026-07-19); Step 8 WhatsApp OTP deferred (**last**) |
| **Guest checkout + guest enrolment** | [2026-06-02-guest-enrollment-portal-provisioning.md](plans/2026-06-02-guest-enrollment-portal-provisioning.md) | ✅ `guest_enrolment_*` | ✅ | `/enrol` no login gate; `create-enrolment-intake`; `resolveCheckoutSession` JWT or `enrolment_token`; admin payment link reuses `PAYMENT_REMINDER` |
| Teachers admin module (V2.11) | [teachers-admin-module.md](plans/teachers-admin-module.md) | ✅ `staff` | 🟡 partial | **Deferred V2.11** — `TeacherService` / `useTeachers` + class-form `staff_id`; no admin page |
| **Payment dunning — collections layer + renewal emails** | [payment-dunning-notifications.md](plans/payment-dunning-notifications.md) | ✅ `00600` + `01300` | ✅ | `_shared/collections/`, `applyBillingScheduleDunningFailure`, `PAYMENT_REMINDER` renewal track, `notification_log.dunning_key` |
| **Enrolment unpaid dunning (§6.x #8)** | [enrolment-payment-dunning.md](plans/enrolment-payment-dunning.md) | ✅ `01300` + `02600` cron | ✅ | `run-enrolment-payment-dunning` cron Day 3/7/14; `applyEnrolmentPaymentDunningStep`; `CLASS_CANCELLATION` on day 14 |
| Native scheduling (calendar + slot booking + Google Calendar) | [scheduling/00-overview.md](plans/scheduling/00-overview.md) | ✅ `02600` + `02900` | ✅ S0–S5 | `/book`, Services, Appointments, GCal; S5 no-show / late-cancel retain payment (no PSP) |

---

## Age override / review — detail

### PR A ✅ Complete

| Item | Status |
| --- | --- |
| `ageEnrolmentPolicy.ts` + tests | ✅ |
| `AgeOverridePanel.tsx` | ✅ |
| `age_at_season_start` on create (web + edge) | ✅ |
| `02100` age helper + guest age gate | ✅ |

### PR B ✅ Complete (code)

| Item | Status |
| --- | --- |
| `02200` review/approve/decline RPCs | ✅ |
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

**Still separate:** [parent-portal-polish.md](plans/parent-portal-polish.md) Step 8 — full `WhatsAppOtpVerifier` i18n + portal embed (**last**, with live WhatsApp).

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
| **Step 7 — `notify_*` scope toggles (1G-b)** | ✅ — [Step 7](plans/parent-portal-polish.md#step-7--optional-phase-1g-b-notify_-toggles) |
| **Step 8 — WhatsApp OTP verify in portal** | 🟡 Hint only — [Step 8](plans/parent-portal-polish.md#step-8--whatsapp-otp-verify-in-portal-deferred) (**last**) |

---

## Grow / iCount / payments — detail

| Migration | Purpose |
| --- | --- |
| `20260608001600` | Payments, expenses, `get_finance_summary`, grow webhook secrets, Grow/iCount credential RPCs, admin document RPCs |
| `20260608000200` | Tenant payment provider columns |
| `20260608001300` | `engagements.payment_dunning_*` columns |
| `20260608000600` | `idx_notification_log_dunning_key`, notification blast RPCs |
| `20260608002600` | pg_cron + pg_net scheduled jobs (billing, dunning, waiver, issue-document, OTP cleanup) |

**Tax document persistence (all providers):** Every issued tax document is written to `payments` (`external_document_*`, `invoice_url`, `invoice_issued_at`, optional `document_pdf_path`) and audited as `payment_document_recorded` via shared `persistPaymentDocumentFields` / `applyBundledDocumentNotify` (Grow, iCount, Invoice4U callback, and `document_queue` issue path). Tenant admins are emailed the invoice (`payment_document_admin_email_sent`); cron `check-missing-documents` (every 15m) alerts when a succeeded payment still lacks a tax doc after 30 minutes and retries admin invoice emails until sent. Pending Invoice4U charges audit `payment.pending_created`; failures use normalized `payment.failed` `after_state`.

**IL product path:** **Invoice4U** bundled — [SPEC.md](../SPEC.md) Phase 1E · [finance/invoice4u/](plans/finance/invoice4u/00-overview.md).

**Invoice4U:** plan + overnight brief ready; implementation on `feat/invoice4u-provider` (mock U1→U4-mock first).

**Grow / iCount:** adapters kept as fallbacks. Dev mocks: `GROW_MOCK` / `ICOUNT_MOCK` / (upcoming) `INVOICE4U_MOCK`.

**VAT (2026-06-28):** App charges **gross**; tax breakdown from provider documents.

**Still manual after mock:** Invoice4U QA register → U0-live.

---

## Payment dunning V1 — detail ✅

Shipped PR #11 (`feat/payment-dunning-v1`):

| Item | Status |
| --- | --- |
| Dunning schema in `01300` / `00600` | ✅ |
| `_shared/collections/` (idempotency, email context, send) | ✅ |
| `applyBillingScheduleDunningFailure` — sole renewal mutator | ✅ |
| Wired: `handle-payment-event`, `renewal-billing` (webhook, catch, missing token) | ✅ |
| `run-enrolment-payment-dunning` cron + `config.toml` | ✅ |
| `applyEnrolmentPaymentDunningStep` + Jerusalem calendar catch-up | ✅ |
| `buildEnrolmentPayUrl` + admin link refactor | ✅ |
| `finalise-payment` clears dunning on pay success | ✅ |
| Tests (28 cases across 3 dunning test files) | ✅ |
| **Manual smoke** (Resend renewal + enrolment cron) | ⏳ Recommended before prod |

Plans: [payment-dunning-notifications.md](plans/payment-dunning-notifications.md), [enrolment-payment-dunning.md](plans/enrolment-payment-dunning.md).

---

## Phase 1F / 1G — gaps without dedicated plans

| Item | SPEC | Code today |
| --- | --- | --- |
| People directory CSV export | Phase 1F — People | ❌ → **V2 start** (not V1-blocking) |
| Admin overview occupancy bar | Phase 1F — Dashboard | ✅ `OccupancyBar` on today's classes table |
| Classes list occupancy + waitlist bar | Phase 1F — Classes | 🟡 → **V2 start** (`AdminClassesList` capacity only; overview has bar) |
| Notification log page | Phase 1F — Notifications | ✅ Mounted on `/admin/notifications` History tab |
| WhatsApp blast (urgent) | Phase 1F — Notifications | ❌ Deferred (Twilio) |
| Contact prefs in portal | Phase 1G | ✅ |
| Upcoming sessions (7-day) | Phase 1G | ✅ |
| WhatsApp OTP verify in portal | Phase 1G | 🟡 Hint only; full OTP flow deferred (**last**) |
| `notify_*` scope toggles | Phase 1G | ✅ Portal prefs (`NotifyScopeFields`) |
| Payment dunning (renewal ladder + emails) | Phase 1E | ✅ — [payment-dunning-notifications.md](plans/payment-dunning-notifications.md) |
| Enrolment unpaid dunning cron | §6.x #8 | ✅ — [enrolment-payment-dunning.md](plans/enrolment-payment-dunning.md) |

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

**Shipped:** Guest checkout + guest enrolment · Unenrol Phase 1 · Age override + review · Parent self-enrolment (Myself) · **Payment dunning (renewal + enrolment unpaid §6.x #8)**.

---

## Suggested next work

| Priority | Work | Plan / notes |
| --- | --- | --- |
| **0** | Soft verify — public e2e ✅ (`e2e:features` without parent/admin flags); portal/admin after `seed:auth-*` + `PLAYWRIGHT_PARENT_E2E=1` / `PLAYWRIGHT_ADMIN_E2E=1` | Playwright feature specs |
| **1** | Prod hardening ✅ in-repo — env map, sourcemaps off, footer legal URLs, monitoring stub; §7 remainder is human/ops | [`.env.example`](../.env.example) · [THIRD_PARTY_SERVICES.md](deployment/THIRD_PARTY_SERVICES.md) |
| **Last** | Live payments: **Invoice4U** mock then QA E2E; then WhatsApp | [finance/invoice4u/OVERNIGHT-AGENT.md](plans/finance/invoice4u/OVERNIGHT-AGENT.md) |
| Later | §7 remainder — separate prod Supabase/Vercel, counsel pages URLs, Sentry package, live Grow/WA | [SPEC.md §7](../SPEC.md#7-v1-production-deployment) |
| **V2 start** | People CSV · classes occupancy/waitlist bar · **V2.2** waitlist · **V2.13** minimal CRM · **V2.14** holiday scheduling | Not V1-blocking |
| **V2.11** | Teachers admin CRUD | [teachers-admin-module.md](plans/teachers-admin-module.md) |
| **V2.13** | Minimal CRM (notes, follow-ups, light pipeline) | [SPEC.md §8 V2.13](../SPEC.md) — plan when prioritized |
| **V2.14** | Holiday-aware class/service scheduling + yearly holiday & schedule exports | [SPEC.md §8 V2.14](../SPEC.md) — plan when prioritized |
| Deferred | Unenrol Phase 2, code rename, other V2 | [code-rename-epic.md](plans/code-rename-epic.md) · SPEC §8 |
