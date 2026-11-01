# Launch readiness audit

**Date:** 2026-11-01 · **Code:** `main` @ `1d824c5` (+ #100, merged during the audit; open #103, #105) · **Prod:** read-only checks via the Supabase connector · **Scope:** first two tenants (ballet school: manual payments, no receipts; photographer: YPay).

## Verdict: not ready yet. 8 blockers, all fixable this week

1. **Prod is 2 months behind `main`.** DB has 34 of 40 migrations, Edge Functions are from Aug (no quote/contract/job-payment functions), web Worker last deployed 27 Aug. → #100 merged 2026-11-01: owner sets up GitHub environments, runs deploy-prod, then rebuilds + deploys the web app. *Database owner + owner*
2. **No email is sent at all**, and login is by email (the Auth email hook is live on prod). → Workers Paid + Cloudflare token, or set `RESEND_API_KEY` as a fallback. *Owner, launch guide*
3. **Encryption key not set on prod.** Until it is, waiver/pay links and saved YPay keys don't work. *Owner, launch guide*
4. **Ballet school has no working "pay at the studio" path.** Parents' online enrolment has no offline option (checkout uses the default provider `grow`, which isn't set up), and every cash payment the admin records queues a tax document (there's no "invoicing off" switch). → owner decision + small code change. Never use `mock` as a workaround. *New app thread*
5. **Backups:** prod is on Free (no Supabase backups), and the nightly R2 backup last ran 27 Oct. → Pro, re-run backup-prod, check a restore before real data goes in. *Owner, launch guide*
6. **New tenants get no waiver or contract template** (prod runs no seeds). → load 07b (health declaration) for the ballet school and 07c (contract) for the photographer in Admin → Setup → Waivers before first use. *Owner + legal thread*
7. **Legal minimum on public forms:** a privacy-policy link next to the enrolment, inquiry, quote and pay forms, plus an enrolment-terms checkbox (APP-GAPS). Today no link shows anywhere. *New app thread, after legal setup doc*
8. **Merge #103** (anon can execute 75 SECURITY DEFINER functions) before real data. *Database owner*

Everything else below is Covered, or a Risk that can follow launch.

Legend: ✅ Covered · ❌ Gap (needs work) · ⚠️ Risk (watch, or fix soon after launch) · ❔ Not verified

---

## 1. Core flows

| Flow | Status | Evidence |
|---|---|---|
| Photographer: lead → quote → accept → contract sign + PDF → deposit → balance → gallery → client portal | ✅ code + demo | Demo build (`VITE_DEMO_MODE=true`) + Playwright: `/admin/jobs`, `/admin/leads`, `/admin/quotes`, `/dashboard`, `/inquire` all render, 0 page errors, en + he. Functions in `supabase/functions/{accept-quote,send-job-contract-link,job-contract-pdf-generate,record-job-payment,job-payment-request-public}` |
| Photographer on prod | ❌ | None of those functions are deployed to prod (`list_edge_functions`: 47 functions, all Aug). Blocker 1 |
| Dance: class list → enrolment → health declaration → payment → parent portal | ⚠️ code only | The demo is photographer-only (`src/demo/main.tsx` starts at `#/admin/jobs`), so the dance flow can't be clicked through without a backend. Unit tests + `e2e/enrolment-features.spec.ts` need Supabase |
| Dance: parent pays at the studio | ❌ | Public checkout (`StepCheckout`, `EnrolmentPaymentForm.tsx:74-80`) only knows card providers or `mock`; there's no offline option. Admin-side offline payment exists (`AdminEnrolmentPaymentStep.tsx:117`, `record-payment`). Blocker 4 |
| Dance: waiver step on prod | ❌ until key | `accept-waiver` needs `WAIVER_HMAC_KEY_V1` (required in `supabase/edge-secrets.json`, #100) and the DB encryption key (link signing). No `consent_templates` row is created by any migration. Blockers 3, 6 |
| Admin basics: login, settings, branding, notifications | ✅ demo | `/login`, `/admin/setup/settings`, `/admin/notifications` render en + he, RTL |

## 2. Auth & tenancy

| Item | Status | Evidence |
|---|---|---|
| Magic-link login | ❌ until email | Auth Send Email hook → `send-auth-email` is live on prod (HANDOVER.md); with no transport, every login email fails. Blocker 2 |
| Tenant isolation (RLS) | ✅ | RLS + policies on all new tables (`20261030000100:73`, `…0200:136`, `…0300:139-167`, `…0500:64`) |
| `verify:rls` coverage | ⚠️ | 37 checks cover people/payments/accounts/`*_enc` only; nothing for `job_details`, `job_payment_requests`, `quotes`, `client_job_details`, `leads` (`scripts/verify-rls.mjs`). Add before the 2nd photographer |
| Subdomain routing | ✅ code / ❔ live | Worker `opalswift-app` routes `*.opalswift.com/*` + `app.` (`apps/web/wrangler.jsonc`). Live hosts couldn't be reached from the audit sandbox (proxy). Wildcard DNS was an owner step in Aug |
| Super-admin lockdown | ✅ | `20260827000100_super_admin_lockdown.sql` is the last migration applied on prod |
| SECURITY DEFINER hardening | ❌ | Prod advisors: `anon_security_definer_function_executable` WARN. Fix in #103 (stacked on #100, no CI status yet). Blocker 8 |
| Bootstrap deadlock | ✅ documented | GO-LIVE-PLAN Phase B trigger-disable steps |

## 3. Payments & tax

| Item | Status | Evidence |
|---|---|---|
| YPay live path + callback check | ✅ | Callbacks are unsigned but verified with `getTransactionsInfo` + amount check (`_shared/payments/ypay/process-callback.ts:72-80`) |
| YPay "failed" callback | ⚠️ | A failed callback marks the pending payment failed without verifying it (`process-callback.ts:114-118`). Low impact (needs the charge id) |
| `*_MOCK` unset on prod | ✅ (after #100) | deploy-prod fails if any `_MOCK$` secret exists (`edge-secrets.json` `forbiddenInProdPatterns`) |
| `confirm-mock-payment` deployed on prod | ⚠️ | Open endpoint (`verify_jwt=false`). Safe only while no tenant has `payment_provider='mock'` (`mock-confirm-eligibility.ts:18`); the super-admin wizard offers "Mock (testing)" (`OperatorOnboardingWizard.tsx:486`). Don't pick it for real tenants |
| No provider + invoicing off (ballet) | ❌ | `record-payment` → `finalisePayment` always enqueues a sale document (`finalise-payment.ts:446-460`). The resolver has no "none" (`_shared/invoicing/index.ts:25-41`), so with default `grow` and no keys each row retries → dead → admin alert. Nothing illegal gets issued, but it's noisy and wrong. Blocker 4 |
| Offline receipts (photographer, YPay) | ✅ planned | Test at the meeting (PHOTOGRAPHER-BETA-SUPABASE.md Part 2 step 10) |
| Dunning / reminders | ⚠️ | `run-enrolment-payment-dunning` sends pay links. For the ballet school they lead to a checkout that can't take payment. Turn dunning off for that tenant, or point it at offline instructions |

## 4. Email

| Item | Status | Evidence |
|---|---|---|
| Transport | ❌ | Cloudflare account is on Workers Free → Email Sending returns 2036. Resend is still wired as a fallback (`_shared/email-client.ts:146-208`), so a `RESEND_API_KEY` would unblock launch. Blocker 2 |
| Secret manifest vs Resend | ⚠️ | `edge-secrets.json` marks the Cloudflare vars as *required*, so a Resend-only prod fails the deploy-prod check. Adjust if Resend is used |
| Templates en/he + RTL | ✅ | All dance and photographer templates take a language; `BaseEmailTemplate.tsx:127` sets `lang`/`dir` |
| Sender domains | ✅ | `resolveTenantSender()`: tenant first, `<subdomain>@opalswift.com` fallback, Reply-To = studio |
| Silent failures if sending is down | ⚠️ | Sends throw and are audited (`payment_confirmation_email_skipped`), but nobody is paged. Login just "never arrives". Sentry PR #105 would surface them |
| Contract PDF attachment | ⚠️ | Cloudflare transport sends a link only (`supportsAttachments()`). Known, acceptable |
| Unsubscribe line in marketing email | ❌ follow-up | APP-GAPS. Blast composer is "marketing": don't use it until fixed, or only for service messages |

## 5. Data safety

| Item | Status | Evidence |
|---|---|---|
| Supabase plan | ❌ | Prod org on Free: no daily backups, no PITR, pauses when idle. Blocker 5 |
| Nightly R2 backup | ⚠️ | Last ran 27 Oct (Actions minutes). #100 fixes migration history and adds a pre-deploy backup |
| Restore runbook + rehearsal | ✅ | `BACKUP-RESTORE-RUNBOOK.md`; `scripts/restore-rehearsal.sh` (#100), rehearsed 2026-11-01 |
| Storage files (waiver/contract PDFs, logos) | ⚠️ | Not in any backup (runbook "Known gap"). Signed contracts live only in bucket `legal-documents` |
| DB encryption key | ❌ | `private.platform_config` has only `cron_secret`, `supabase_functions_url` (query 2026-11-01). Blocker 3. No re-encrypt path: store it in the password manager first |
| Backup gpg private key | ✅ | Password manager only (runbook) |
| Drift / health checks | ✅ (after #100) | `db-health.yml` nightly: drift dev + prod, advisors → `db-drift` issue |

## 6. Ops

| Item | Status | Evidence |
|---|---|---|
| DB + functions pipeline | ✅ merged | #100 merged 2026-11-01. Still to do: GitHub environments + secrets, then the first deploy-prod run. Blocker 1 |
| Web app deploy | ❌ | Not automated. `DEV-PROD-PIPELINE.md` rule 4: "web deploy is not part of this pipeline yet". It's a manual `wrangler deploy` from the owner's machine with a gitignored `apps/web/.env.production`. Worker last modified 2026-08-27 |
| `VITE_*` for prod | ⚠️ | Lives only on the owner's machine; legal URLs empty. `VITE_*` values are baked in at build time, so changing one means a rebuild + redeploy |
| Error tracking | ⚠️ | #104 merged (web, no-op without DSN). #105 (edge) open. No DSN yet = no alerts at launch |
| Uptime monitoring | ❌ follow-up | None found in repo/docs. Free external check on `creativeballet.opalswift.com` + the auth endpoint is enough |
| Cron jobs on prod | ✅ | 9 jobs, `pg_cron` + `pg_net` on. New photographer crons arrive with the migrations |

## 7. Legal / compliance in the app (from `docs/legal/APP-GAPS.md`)

| Gap | Blocks launch? | Why |
|---|---|---|
| Privacy link next to forms that collect data (enrolment, inquiry, quote, pay) | **Yes** | Privacy Law §11 notice at collection; children's data. Blocker 7 |
| Enrolment terms checkbox (07a) | **Yes** (dance) | Season/cancellation terms must be accepted before payment |
| Health declaration replaces bundled waiver (07b) | **Yes** | Prod has no template anyway: load 07b, not the seed waiver. Blocker 6 |
| Per-tenant footer privacy/terms links | Yes before the photographer | A single env URL would show one studio's policy on the other's site |
| Accessibility statement link | Strongly recommended week 1 | Text exists (06). It's a footer link |
| Studio signup Terms/DPA checkbox | No | Self-serve signup is gated off; first two tenants are provisioned by hand (sign on paper/email) |
| Marketing consent per channel + unsubscribe | No, if no marketing sends | Don't use the blast composer for marketing until done |
| Photo consent per purpose + Hebrew typo "מנתן" | Soon | Typo confirmed: `he.json` `pages.people.photo_consent_label` / `media_consent_label` |
| MFA, 24-month access logs, full export | No | Post-launch |

## 8. Accessibility & i18n

| Item | Status | Evidence |
|---|---|---|
| CI axe suite | ⚠️ | `e2e/accessibility-compliance.spec.ts` covers `/` and `/login` only. Enrolment, waiver, quote and pay pages aren't scanned |
| Hebrew completeness | ✅ almost | 1,918 en keys vs 1,917 he. Missing: `pages.enrolment.enrol_myself` (dance enrolment + parent dashboard, falls back to English) |
| RTL | ✅ | Demo in Hebrew: `dir=rtl`, no English UI text left on 9 screens (only sample data) |

## 9. Other things a CTO would check

| Item | Status | Note |
|---|---|---|
| Ballet school "not a registered business" | ⚠️ | Taking money with no receipts is an accountant question (legal README Q16). The app must not issue documents in its name (Blocker 4) |
| Stale functions on prod | ⚠️ | `confirm-mock-payment`, `booking-expiry-sweep` (no in-function auth), `send-otp-email` (no rate limit, gateway-locked). deploy-prod redeploys from git but doesn't delete extras |
| Landing site | ❔ | `opalswift.com` answers 200; no landing Worker in the account list, so check what serves it before linking policies there |
| Demo covers photographer only | ⚠️ | A dance demo would let the owner rehearse the ballet flow without prod |
| Seeds on prod | ✅ | Never run (guards in `seed:dev`, rules in every doc) |

---

**How this was checked:** repo read at `1d824c5`; PR #100/#103 diffs and check runs; prod read-only queries (tenant/user counts, `platform_config` key *names* only, migrations, cron, buckets), `list_edge_functions`, security advisors; Cloudflare `workers_list`; demo build + Playwright smoke in en/he. No hosted system was written to and no secret value was read.
