# Code map: where is X?

A plain-English guide to finding your way around OpalSwift. Start here.
Last checked: 10 Nov 2026.

## The five big boxes

| Box | Folder | What it is |
| --- | --- | --- |
| The app | `apps/web/` | Everything studios, parents and clients see after they log in, plus enrolment, booking and paying. |
| The marketing site | `apps/marketing/` | opalswift.com: plain HTML pages in `apps/marketing/public/` (one page per kind of business). |
| The database and server jobs | `supabase/` | Tables and rules (`migrations/`), and small server programs (`functions/`) that send emails, take payments and run nightly jobs. |
| Shared pieces | `packages/shared/` | Code used by both the app and the server: email templates, prices, the feature list, form rules. |
| Help files | `docs/` | Plans, legal texts, how-to guides for releases and secrets. |

Two small extras: `workers/lead-email-ingest/` turns emailed enquiries into leads, and `scripts/` holds helper tools for developers.

## Words the code uses (and what you call them)

The code sometimes uses older or more general names than the screens do.

| On screen | In the code |
| --- | --- |
| Studio | `tenant` |
| Season | `term` (for example `features/terms/`, `TermsPage.tsx`) |
| Class, workshop, service | `offering` in the database, `classes` in app folders |
| Shoot / Project | `job` (for example `features/jobs/`, `JobsPage.tsx`) |
| Student, parent, client | `person` (one table for everyone) |
| Someone signing a form for a class or shoot | `engagement` |
| Look and wording per kind of business | `skin`, `vertical` |
| Signed form | `waiver` |

## Where is a screen?

Each address in the app has one entry in `apps/web/src/router.tsx`. Follow it to a file in `apps/web/src/pages/`, which then pulls the real work from `apps/web/src/features/<area>/`.

| Screen | Page file | Main code |
| --- | --- | --- |
| Home / dashboard | `pages/AdminDashboard.tsx`, `pages/HomePage.tsx` | `features/admin-dashboard/`, `features/home/`, `components/Dashboard/` |
| Leads | `pages/LeadsPage.tsx`, `LeadFormsPage.tsx`, `GetLeadsPage.tsx` | `features/crm/` |
| Students | `pages/StudentsPage.tsx` | `features/students/`, `features/people/` |
| Families | `pages/FamiliesPage.tsx`, `FamilyDetailPage.tsx` | `features/families/` |
| Classes | `pages/AdminClassesPage.tsx`, `ClassesPage.tsx` | `features/classes/` |
| Seasons | `pages/TermsPage.tsx` | `features/terms/` |
| Class levels | `pages/LevelsPage.tsx` | `features/levels/` |
| Shoots / projects | `pages/JobsPage.tsx`, `JobDetailPage.tsx` | `features/jobs/` |
| Quotes | `pages/AdminQuotesPage.tsx`, `QuotePage.tsx` | `features/quotes/` |
| Photo shop | `pages/PhotoShopPage.tsx` | `features/jobs/` (photo shop parts), `packages/shared/src/photoShop.ts` |
| Appointments and booking | `pages/AdminAppointmentsPage.tsx`, `BookingPage.tsx`, `BookingSettingsPage.tsx` | `features/scheduling/` |
| Messages to families | `pages/NotificationsPage.tsx` | `features/notifications-admin/` |
| Money (payments, expenses, import) | `pages/FinanceHubPage.tsx`, `PaymentsLogPage.tsx`, `ExpensesPage.tsx` | `features/finance-admin/`, `features/finance/` |
| Payment and invoice settings | `pages/PaymentSettingsPage.tsx`, `InvoicingSettingsPage.tsx`, `BundledPaymentsSettingsPage.tsx` | `features/settings/` |
| Studio settings, logo, colours | `pages/TenantSettingsPage.tsx` | `features/settings/`, `features/skins/` |
| Forms to sign | `pages/WaiversPage.tsx` | `features/waivers/`, `apps/web/src/legal/` |
| Enrolment (what parents see) | `pages/EnrolPage.tsx`, `EnrolPayPage.tsx` | `features/enrolment/` |
| Parent and client portal | `pages/PortalDashboard.tsx` | `components/Dashboard/ParentPortal.tsx` (classes), `features/jobs/components/ClientPortal.tsx` (shoots) |
| Sign up and new studio | `pages/SignupPage.tsx`, `CreateStudioPage.tsx` | `features/self-serve/`, `features/auth/` |
| Platform (your owner pages) | `pages/PlatformFeaturesPage.tsx`, `PlatformOnboardPage.tsx` | `features/platform/`, `features/platform-shell/` |
| Top menu | – | `components/Navigation/navigationConfig.ts` |

## Where is a piece of wording?

- App wording: `apps/web/src/i18n/en.json` and `he.json`. Search for the English words to find the key, then the same key in `he.json`.
- Wording that changes per kind of business: `apps/web/src/i18n/verticals/`.
- Email wording: `packages/shared/src/i18n/email-templates-en.json` and `-he.json`.
- Legal texts (terms, privacy, forms): `docs/legal/` (each in `.en.md` and `.he.md`). Anything waiting for the lawyer: `docs/legal/AWAITING-LAWYER-REVIEW.md`.
- Marketing site wording: the HTML pages in `apps/marketing/public/`.

## Where is the money code?

- Server side: `supabase/functions/_shared/payments/`. Each provider has its own file in `providers/` (YPay, Takbull, Grow and others).
- Which provider a studio uses: `getPaymentProvider` in `supabase/functions/_shared/payments/index.ts`.
- Invoices and receipts: `supabase/functions/_shared/invoicing/`.
- Starting a payment: `supabase/functions/create-checkout/`, `prepare-enrolment-checkout/`.
- Provider telling us a payment went through: `handle-payment-event/`, `takbull-ipn/`.

## Where are the emails?

- How they look: `packages/shared/src/email-templates/`.
- Who sends them: `supabase/functions/send-notification/`, `send-auth-email/` (log-in codes), `send-otp-email/`.
- `supabase/functions/_shared/email-dist/` is built automatically from `packages/shared`. Do not edit it by hand.

## Where is the database?

- Every change ever made to the tables, in date order: `supabase/migrations/`.
- A list of every table and column, built automatically: `packages/shared/src/database.types.ts`. Do not edit by hand.
- Who can see which rows (security rules): inside the migrations, and checked by `supabase/tests/`.
- One-off fixes to live data: `supabase/prod-tasks/` (see `docs/deployment/PROD-TASKS.md`).
- Demo studios for the dev site: `supabase/seed-*.sql`.

## Releases, secrets and running things

- How dev and live are released: `docs/deployment/DEV-PROD-PIPELINE.md`.
- Shared secrets and how to change them: `docs/deployment/SHARED-SECRETS.md`.
- Automated checks that run on every change: `.github/workflows/`.
- Day-to-day operations (log-in emails, scheduled jobs): `docs/deployment/MANUAL_OPERATIONS_RUNBOOK.md`.
- Look and feel rules: `DESIGN_SYSTEM.md`.

## Tests

- App tests sit next to the code they check (`*.test.ts`) or in `apps/web/src/__tests__/`.
- Click-through browser tests: `apps/web/e2e/`.
- Database security tests: `supabase/tests/`.

## The demo app

`apps/web/src/demo/` is a pretend database used for the screenshots and the demo on the marketing site. It is not the real app. If something looks odd only in the demo, look here.

## Files that are out of date

These describe the first plan (a ballet-school app with Stripe and Twilio). Each now carries a note at the top. Trust this map and the code over them:
`SPEC.md`, `docs/IMPLEMENTATION_STATUS.md`, `apps/web/src/ARCHITECTURE.md` (partly).
