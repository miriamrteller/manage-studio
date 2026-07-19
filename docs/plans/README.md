# Feature plans

Agent-optimized implementation plans. Create before coding (see `.instructions.md` workflow).

**Live status:** [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md)  
**Archived (shipped / superseded):** [archive/](archive/)

## Active & upcoming

| Date | Feature | Status |
| --- | --- | --- |
| 2026-07 | [Native scheduling + Google Calendar](scheduling/00-overview.md) | **S0–S5 ✅** — [GCal](scheduling/google-calendar-integration.md) · [deploy/test](scheduling/deployment-and-testing.md); live payments/WhatsApp last |
| 2026-06-29 | [iCount IL default (mock-first)](finance/icount/00-overview.md) | **Mock phase ✅** — I0-live deferred; I6-research optional |
| 2026-07-16 | [V1 migration fourth squash + payment merge](v1-migration-squash-20260716.md) | **Shipped** on `main` (PR #17) — fresh DB reset → push → seed → types still recommended |
| 2026-07-05 | [V1 migration third squash](v1-migration-squash-20260705.md) | **Shipped** — folded into `20260608*` base chain |
| 2026-07-05 | [V1 pg_cron scheduled jobs](v1-pg-cron-scheduled-jobs.md) | **Shipped** — implemented in `20260608002800` (fourth squash) |
| 2026-07-05 | [Enrolment unpaid dunning §6.x #8](enrolment-payment-dunning.md) | ✅ Shipped — PR #11 (same) |
| 2026-07-05 | [Notification log — message detail viewer](notification-log-detail-viewer.md) | ✅ Shipped — dialog from stored `subject` / `variables` / `body_preview` |
| 2026-07-05 | [Notification log — recipient search](notification-log-recipient-search.md) | ✅ Shipped — debounced email/phone filter on History tab |
| 2026-07-01 | [Notification log viewer](notification-log-page.md) | ✅ Shipped — History tab on `/admin/notifications` |
| 2026-06-30 | [Notification blast composer](notification-blast-composer.md) | ✅ Shipped |
| 2026-06-29 | [Parent portal polish](parent-portal-polish.md) | ✅ Shipped |
| 2026-06-28 | [Admin operations overview](admin-overview-dashboard.md) | ✅ Shipped |
| 2026-06-28 | [Grow live sandbox E2E](grow-live-e2e-verification.md) | Manual QA — optional |
| 2026-06-07 | [Code rename epic (ex-D5)](code-rename-epic.md) | Deferred |

## V2 (deferred from V1)

| Date | Feature | Status |
| --- | --- | --- |
| 2026-07 | People directory CSV export | **V2 start** — Phase 1F polish; not required for V1 runtime |
| 2026-07 | Classes list occupancy + waitlist bar | **V2 start** — overview already shows occupancy/waitlist |
| 2026-07 | [Waiting list automation](../SPEC.md) (V2.2) | Schema + overview counts in V1; `process-waiting-list` stays V2.2 |
| 2026-07-01 | [Teachers admin module](teachers-admin-module.md) | **V2.11** — agent plan ready; not V1 scope |

## Shipped reference (keep for SPEC links)

| Date | Feature | Status |
| --- | --- | --- |
| 2026-06-28 | [Parent self-enrolment P1–P3](parent-self-enrolment/00-overview.md) | ✅ Complete |
| 2026-07-05 | [Payment dunning V1](payment-dunning-notifications.md) | ✅ Shipped — renewal + enrolment unpaid ([enrolment plan](enrolment-payment-dunning.md)) |
| 2026-06-28 | [Age override PR B](age-override-pr-b.md) | ✅ Complete — [index](2026-06-02-age-override-and-review-request.md) |
| 2026-06-25 | Age override PR A | ✅ — [archive/age-override-pr-a.md](archive/age-override-pr-a.md) |
| 2026-06-24 | Offering `location` | Complete |
| 2026-06-07 | [Phase D — label display wiring](phase-d-display-wiring.md) | Complete |
| 2026-06-07 | [Tenant settings hub](tenant-settings-hub.md) | Implemented |
| 2026-06-07 | [V3.0 operator onboarding wizard](v3-0-operator-onboarding-wizard.md) | Scaffold |
| 2026-06-02 | [Unenrol Phase 1](2026-06-02-unenrol-phase-1.md) | Complete |
| 2026-06-02 | [VAT pricing](2026-06-02-vat-pricing.md) | Complete |
| 2026-06-02 | [Guest enrollment & portal](2026-06-02-guest-enrollment-portal-provisioning.md) | Complete |
| — | [Finance / Grow G0–G7](finance/00-overview.md) | Code shipped; live E2E manual |
| — | [Admin finance F1–F6](admin-dashboard-finance/00-overview.md) | Complete |
