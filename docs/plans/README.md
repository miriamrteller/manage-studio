# Feature plans

Agent-optimized implementation plans. Create before coding (see `.instructions.md` workflow).

**Live status:** [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md)  
**Archived (shipped / superseded):** [archive/](archive/) — finished plans move there; only one current copy of each plan is kept.

## Active & upcoming

| Date | Feature | Status |
| --- | --- | --- |
| 2026-11-04 | [Takbull payments](TAKBULL-INTEGRATION.md) | **ACTIVE** — being built, hidden until launch |
| 2026-11-04 | [Account credit](ACCOUNT-CREDIT.md) | **Parked** until Takbull is live |
| 2026-11-06 | [Payment options studios see](PAYMENT-OPTIONS-DECISION.md) | **Owner decision** — 10 Nov: only own YPay (default), pay at the studio, Takbull (coming soon) |
| 2026-11-02 | [Leads: where they come from](LEADS.md) | **ACTIVE** — plan; lead form / channels / digest work references it |
| 2026-11-02 | [Onboarding audit](ONBOARDING-AUDIT.md) | **ACTIVE** — legal steps to re-run; screenshots in [onboarding-audit/](onboarding-audit/) |
| 2026-11-02 | [Payments and invoicing audit](PAYMENTS-AUDIT.md) | Audit — findings open |
| 2026-11-02 | [OpalSwift billing plan](opalswift-billing-plan.md) | Plan only |
| 2026-11-02 | [OpalSwift on OpalSwift (dogfooding)](OPALSWIFT-ON-OPALSWIFT.md) | Plan only |
| 2026-10-30 | [Light Blue gap analysis](lightblue-gap-analysis.md) | Photographer gap list — open items |
| 2026-10-30 | Photographer beta threads: [A — shoots/contracts](2026-10-30-photographer-beta-a.md) · [B — payments](2026-10-30-photographer-b-payments.md) · [C — quotes](2026-10-30-photographer-c-quotes.md) · [G — contract PDF](2026-10-30-photographer-g-contract-pdf.md) · [H — offline receipts](2026-10-30-photographer-h-offline-receipts.md) | Beta — follow-ups open |
| 2026-08-19 | [CRM lead capture — multi-tenant, all channels](crm-lead-capture-channels.md) | **ACTIVE** — email ingest shipped (PR #52→#54→#55 stack); step 1 (self-onboard hardening) in progress; step 2 = capture endpoint + admin leads page |
| 2026-07 | [Native scheduling + Google Calendar](scheduling/00-overview.md) | **S0–S5 ✅** — [GCal](scheduling/google-calendar-integration.md) · [deploy/test](scheduling/deployment-and-testing.md); live payments/WhatsApp last |
| 2026-07-20 | [Invoice4U IL bundled](finance/invoice4u/00-overview.md) | **ACTIVE** — overnight mock U1→U4-mock on `feat/invoice4u-provider` |
| 2026-06-29 | [iCount IL (mock-first)](finance/icount/00-overview.md) | **Mock phase ✅** — fallback; live deferred |
| 2026-06-29 | [Parent portal polish](parent-portal-polish.md) | ✅ Shipped — Step 8 (WhatsApp OTP verify) still deferred |
| 2026-06-28 | [Grow live sandbox E2E](grow-live-e2e-verification.md) | Manual QA — optional |
| 2026-06-07 | [Code rename epic (ex-D5)](code-rename-epic.md) | Deferred |

## V2 (deferred from V1)

| Date | Feature | Status |
| --- | --- | --- |
| 2026-07 | People directory CSV export | **V2 start** — Phase 1F polish; not required for V1 runtime |
| 2026-07 | Classes list occupancy + waitlist bar | **V2 start** — overview already shows occupancy/waitlist |
| 2026-07 | [Waiting list automation](../../SPEC.md) (V2.2) | Schema + overview counts in V1; `process-waiting-list` stays V2.2 |
| 2026-07 | Minimal CRM (V2.13) | Notes, follow-ups, light lead/family pipeline — [SPEC §8 V2.13](../../SPEC.md) |
| 2026-07 | Payment / invoice audit polish (V2.15) | Detail timeline UI; optional column history / decline rows — [SPEC §8 V2.15](../../SPEC.md); after prod hardening |
| 2026-07-01 | [Teachers admin module](teachers-admin-module.md) | **V2.11** — agent plan ready; not V1 scope |

## Shipped, kept in place

Kept here because a script, a Cursor rule, code or open payments work still points at them.

| Date | Feature | Status |
| --- | --- | --- |
| 2026-06-28 | [Parent self-enrolment P1–P3](parent-self-enrolment/00-overview.md) | ✅ Complete — read by `pnpm parent-self-enrolment:prompt` |
| 2026-07-05 | [Payment dunning V1](payment-dunning-notifications.md) | ✅ Shipped — renewal + enrolment unpaid ([enrolment plan](enrolment-payment-dunning.md)) |
| 2026-06-07 | [V3.0 operator onboarding wizard](v3-0-operator-onboarding-wizard.md) | Scaffold — polish / follow-up open |
| — | [Finance / Grow G0–G7](finance/00-overview.md) | Code shipped; live E2E manual — read by `pnpm finance:prompt` |
| — | [Admin finance F1–F6](admin-dashboard-finance/00-overview.md) | Complete — read by `pnpm finance-admin:prompt` |

Everything else that has shipped (age override, guest enrolment, unenrol, VAT pricing, admin overview, notification log/blast, Phase D, settings hub, offering `location`, V1 squashes + pg_cron) is in [archive/](archive/README.md).
