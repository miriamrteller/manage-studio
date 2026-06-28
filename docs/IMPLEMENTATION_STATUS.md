# Implementation status

Living checklist for in-flight SPEC features. Normative design remains in [SPEC.md](../SPEC.md).

**Last updated:** 2026-06-28 (merged `main` into PR #5; Phase 1F admin overview + UI fixes status reconciled)

---

## V1 phase progress (SPEC §6)

Rough completion against [SPEC.md §6 V1 Implementation](../SPEC.md#6-v1-implementation). Not a hour estimate — feature presence only.

| Phase | Scope | ~Done | Remaining |
| --- | --- | --- | --- |
| **1A–1B** | Skeleton, auth, tenant context | ✅ ~95% | A11y CI gates, polish |
| **1C** | People, families, classes, enrolment, waivers | ✅ ~92% | Teachers admin UI; class occupancy view |
| **1D** | Notifications engine | 🟡 ~60% | Blast composer UI; WhatsApp E2E |
| **1E** | Payments (Stripe + Grow) | 🟡 ~85% | Live Grow sandbox E2E; dunning cron hardening |
| **1F** | Admin dashboard | ✅ ~95% | Operations overview ✅ (PR #5); notification blast; people CSV export |
| **1G** | Parent / student portal | 🟡 ~78% | Contact prefs in portal; upcoming sessions; WhatsApp verify |
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
| **Age override (PR A)** | [archive/age-override-pr-a.md](plans/archive/age-override-pr-a.md) | ✅ `260001` | ✅ | Policy module, panel, snapshot, guest age gate, tests |
| **Parent age review (PR B)** | [age-override-pr-b.md](plans/age-override-pr-b.md) | ✅ `260002` | ✅ | Shipped `baa6dd1` — **manual E2E smoke recommended** before prod |
| **Parent self-enrolment (P1–P3)** | [parent-self-enrolment/00-overview.md](plans/parent-self-enrolment/00-overview.md) | — | ✅ | `resolveGuardianProfile`, portal **Myself**, `GuardianProfileSetupPanel` (`f0c327a`) |
| **Phase 1F admin operations overview** | [admin-overview-dashboard.md](plans/admin-overview-dashboard.md) | ✅ `20260626000300` | ✅ | RPC, service, hook, 6 components, 7 tests, i18n — **PR #5 complete** |
| Notification blast composer | [notification-blast-composer.md](plans/notification-blast-composer.md) | ❌ | ❌ | `send-notification` exists; no compose UI |
| Parent portal polish | [parent-portal-polish.md](plans/parent-portal-polish.md) | — | 🟡 | **Myself → parent-self-enrolment ✅**; contact prefs + upcoming still ❌ |
| Teachers admin module | [teachers-admin-module.md](plans/teachers-admin-module.md) | ✅ `staff` | ❌ | `TeacherService` / `useTeachers` only — no admin page |
| Code rename epic (ex-D5) | [code-rename-epic.md](plans/code-rename-epic.md) | — | — | Deferred |

---

## Age override / review — detail

### PR A ✅ Complete

Policy module, admin override panel, `age_at_season_start` snapshot, guest age gate, tests.

### PR B ✅ Complete (code)

| Item | Status |
| --- | --- |
| RPCs + intake + `ageReviewService` + emails | ✅ |
| Request form, admin panel, stepper + step wiring | ✅ |
| Admin deep link `?engagement=` + i18n + badge | ✅ |
| Unit tests | ✅ |
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

**Still separate:** [parent-portal-polish.md](plans/parent-portal-polish.md) — contact preferences, upcoming sessions.

---

## Grow / payments — detail

| Migration | Purpose |
| --- | --- |
| `20260625000300` | Grow webhook secrets |
| `20260625000500` | Admin resend document RPCs |
| `20260608001600` (+ edits) | Payments + Grow document columns + credential RPCs (consolidated) |
| `20260608000200` (+ edits) | Tenant payment provider columns |

**VAT (2026-06-28):** App charges **gross** offering price; pretax/VAT split removed from `packages/shared/src/pricing.ts`. Israeli tax breakdown comes from Grow/Green Invoice on issued documents.

**Still manual:** end-to-end charge on real Meshulam sandbox — [grow-live-e2e-verification.md](plans/grow-live-e2e-verification.md).

---

## Phase 1F / 1G — gaps without dedicated plans

| Item | SPEC | Code today |
| --- | --- | --- |
| People directory CSV export | Phase 1F — People | ❌ |
| Classes occupancy + waitlist bar | Phase 1F — Classes | 🟡 Capacity column only |
| WhatsApp blast (urgent) | Phase 1F — Notifications | ❌ |
| Contact prefs in portal | Phase 1G | ❌ Editor built, not mounted |
| Upcoming sessions (7-day) | Phase 1G | ❌ |
| WhatsApp OTP verify in portal | Phase 1G | ❌ |
| `notify_*` scope toggles | Phase 1G | ❌ DB yes; schema/editor no |
| Payment dunning (Day 3/7/14) | Phase 1E | 🟡 Templates + cron; journey not verified |

---

## §6.x deferred backlog

1. Guest checkout · 2. Stripe Connect · 3. `discount_rules` at checkout · 4. Per-tenant Twilio/Resend · 5. Multi-region · 6. Unenrol Phase 2 · 7. Unenrol Phase 3

**Shipped:** Unenrol Phase 1 · Age override + review · Parent self-enrolment (Myself).

---

## Suggested next work

| Priority | Work | Plan / notes |
| --- | --- | --- |
| **0** | **Merge PR #5** (Phase 1F overview) after HITL-001/002/003 sign-off | [admin-overview-dashboard.md](plans/admin-overview-dashboard.md) |
| **1** | **Parent portal polish** — contact prefs + upcoming sessions | [parent-portal-polish.md](plans/parent-portal-polish.md) |
| **2** | Grow live sandbox E2E | [grow-live-e2e-verification.md](plans/grow-live-e2e-verification.md) |
| **3** | Notification blast composer | [notification-blast-composer.md](plans/notification-blast-composer.md) |
| **4** | Teachers admin CRUD | [teachers-admin-module.md](plans/teachers-admin-module.md) |
| **5** | PR B + parent self-enrolment manual smoke | Before pilot launch |
| Later | §7 production deployment | [SPEC.md §7](../SPEC.md#7-v1-production-deployment) |
| Optional | Unenrol Phase 2 (refunds) | No plan yet |
