# Launch readiness audit

**Updated:** 2026-11-01 11:30 · **Code:** `main` @ `0e260d8` · **Prod:** read-only re-check at 11:10 (0 tenants, 0 users, 34 migrations, no encryption key) · **Scope:** first two tenants (ballet school: pay at the studio, no receipts; photographer: YPay).
First version: 2026-11-01 09:45 @ `1d824c5` (#110). Owner-side facts marked *(coordinator)* come from the coordinator and weren't checked from here.

## Verdict: code is ready; prod needs one DB fix, then deploy and setup

**Done since the first audit:**
- Code: #103 security hardening, #114 pay at the studio + invoicing off, #117/#118 legal pages, links, privacy notice and recorded terms acceptance, #121 per-purpose photo consent, marketing consent per channel and unsubscribe/STOP, #123 two-step sign-in, 24-month audit retention and full studio export, #112/#116 Resend as email transport, #119 axe scan + photographer RLS checks, #105/#111 Sentry.
- Owner: GitHub environments + secrets *(coordinator)*; Resend secrets on prod and opalswift.com verified *(coordinator)*; backup-prod green at 10:36 and 11:16 (Actions runs 83, 84).

Still open, in launch order:
1. **deploy-prod is blocked:** migration `20261101000100` aborts on definer functions it doesn't classify (dev: `handle_new_user_v2`; prod: `rls_auto_enable` from Supabase's auto-RLS). The DB thread is adding a migration that runs before it. *Database owner*
2. **Then deploy:** run deploy-prod (34 → 43+ migrations, all Edge Functions), then rebuild and deploy the web app (still manual). *Owner + launch guide*
3. **Encryption key** not set on prod. *Owner*
4. **Supabase Pro**, plus one restore check from the new backups. *Owner + launch guide*
5. **Bootstrap the ballet school:** `payment_provider='offline'`, `invoicing_provider='none'` (GO-LIVE-PLAN Phase B), load the 07b health declaration, fill in the legal profile and publish the legal pages. *Owner + launch guide*

In review: #126 (offline payment instructions, settings switches, 30-day auto-release of unpaid cash places).

Everything else below is Covered, or a Risk that can follow launch.

Legend: ✅ Covered · ❌ Gap (needs work) · ⚠️ Risk (watch, or fix soon after launch) · ❔ Not verified

---

## 1. Core flows

| Flow | Status | Evidence |
|---|---|---|
| Photographer: lead → quote → accept → contract sign + PDF → deposit → balance → gallery → client portal | ✅ code + demo | Demo build (`VITE_DEMO_MODE=true`) + Playwright: `/admin/jobs`, `/admin/leads`, `/admin/quotes`, `/dashboard`, `/inquire` all render, 0 page errors, en + he. Functions in `supabase/functions/{accept-quote,send-job-contract-link,job-contract-pdf-generate,record-job-payment,job-payment-request-public}` |
| Photographer on prod | ❌ until deploy | None of those functions are deployed to prod yet (Aug versions only). Blockers 1–2 |
| Dance: class list → enrolment → health declaration → payment → parent portal | ⚠️ code only | The demo is photographer-only (`src/demo/main.tsx` starts at `#/admin/jobs`), so the dance flow can't be clicked through without a backend. Unit tests + `e2e/enrolment-features.spec.ts` need Supabase |
| Dance: parent pays at the studio | ✅ (#114) | `payment_provider='offline'`: checkout shows "Pay at the studio" (`OfflinePaymentNotice.tsx`), the place stays pending until an admin clicks Record offline payment. Set at bootstrap (blocker 5) |
| Dance: waiver step on prod | ❌ until key + template | `accept-waiver` needs `WAIVER_HMAC_KEY_V1` (deploy-prod checks it) and the DB encryption key. No `consent_templates` row is created by any migration: load 07b. Blockers 3, 5 |
| Admin basics: login, settings, branding, notifications | ✅ demo | `/login`, `/admin/setup/settings`, `/admin/notifications` render en + he, RTL |

## 2. Auth & tenancy

| Item | Status | Evidence |
|---|---|---|
| Magic-link login | ⚠️ until deploy | Auth email hook → `send-auth-email` is live on prod; it sends once the new functions are deployed with the Resend secrets. Test one login after deploy-prod |
| Tenant isolation (RLS) | ✅ | RLS + policies on all new tables (`20261030000100:73`, `…0200:136`, `…0300:139-167`, `…0500:64`) |
| `verify:rls` coverage | ✅ (#119) | Now also checks anon on `job_details`, `job_payment_requests`, `quotes`, `quote_lines`, `leads`, `waiver_evidence_pdfs`, `automatic_email_log`, plus cross-tenant checks when a photographer tenant exists (skipped, not passed, otherwise) |
| Subdomain routing | ✅ code / ❔ live | Worker `opalswift-app` routes `*.opalswift.com/*` + `app.` (`apps/web/wrangler.jsonc`). Live hosts couldn't be reached from the audit sandbox (proxy). Wildcard DNS was an owner step in Aug |
| Super-admin lockdown | ✅ | `20260827000100_super_admin_lockdown.sql` is the last migration applied on prod |
| SECURITY DEFINER hardening | ✅ in code (#103) | Reaches prod with deploy-prod (blocker 1) |
| Bootstrap deadlock | ✅ documented | GO-LIVE-PLAN Phase B trigger-disable steps |

## 3. Payments & tax

| Item | Status | Evidence |
|---|---|---|
| YPay live path + callback check | ✅ | Callbacks are unsigned but verified with `getTransactionsInfo` + amount check (`_shared/payments/ypay/process-callback.ts:72-80`) |
| YPay "failed" callback | ⚠️ | A failed callback marks the pending payment failed without verifying it (`process-callback.ts:114-118`). Low impact (needs the charge id) |
| `*_MOCK` unset on prod | ✅ (after #100) | deploy-prod fails if any `_MOCK$` secret exists (`edge-secrets.json` `forbiddenInProdPatterns`) |
| `confirm-mock-payment` on prod | ✅ (#112) | `mock` provider now needs a `*_MOCK` flag (dev only), and the wizard hides Mock in prod builds. Live on prod after deploy-prod |
| No provider + invoicing off (ballet) | ✅ (#114) | `invoicing_provider='none'`: `enqueueDocument` queues nothing, the missing-invoice watchdog skips the studio |
| Offline receipts (photographer, YPay) | ✅ planned | Test at the meeting (PHOTOGRAPHER-BETA-SUPABASE.md Part 2 step 10) |
| Dunning / reminders | ✅ (#114) | Offline studios are skipped: no pay-link reminders, no day-14 auto-cancel |

## 4. Email

| Item | Status | Evidence |
|---|---|---|
| Transport | ✅ *(coordinator)* | Resend: `EMAIL_TRANSPORT=resend` + `RESEND_API_KEY` set on prod, opalswift.com verified. Cloudflare later is a config switch |
| Secret manifest vs Resend | ✅ (#112, #116) | deploy-prod's secret check accepts Resend-only prod |
| Templates en/he + RTL | ✅ | All dance and photographer templates take a language; `BaseEmailTemplate.tsx:127` sets `lang`/`dir` |
| Sender domains | ✅ | `resolveTenantSender()`: tenant first, `<subdomain>@opalswift.com` fallback, Reply-To = studio |
| Silent failures if sending is down | ⚠️ | Sends throw and are audited (`payment_confirmation_email_skipped`), but nobody is paged. Login just "never arrives". Sentry PR #105 would surface them |
| Contract PDF attachment | ⚠️ | Cloudflare transport sends a link only (`supportsAttachments()`). Known, acceptable |
| Unsubscribe line in marketing email | ❌ follow-up | APP-GAPS. Blast composer is "marketing": don't use it until fixed, or only for service messages |

## 5. Data safety

| Item | Status | Evidence |
|---|---|---|
| Supabase plan | ❌ owner step | Pro not confirmed yet: no daily backups or PITR until then (the R2 backups cover the gap). Blocker 4 |
| Nightly R2 backup | ✅ | backup-prod green on 2026-11-01 at 10:36 and 11:16 (runs 83, 84), using the new prod DB password |
| Restore runbook + rehearsal | ✅ | `BACKUP-RESTORE-RUNBOOK.md`; `scripts/restore-rehearsal.sh` (#100), rehearsed 2026-11-01 |
| Storage files (waiver/contract PDFs, logos) | ⚠️ | Not in any backup (runbook "Known gap"). Signed contracts live only in bucket `legal-documents` |
| DB encryption key | ❌ owner step | Re-checked 11:10: `private.platform_config` still has only `cron_secret`, `supabase_functions_url`. No re-encrypt path: store it in the password manager first. Blocker 3 |
| Backup gpg private key | ✅ | Password manager only (runbook) |
| Drift / health checks | ✅ (after #100) | `db-health.yml` nightly: drift dev + prod, advisors → `db-drift` issue |

## 6. Ops

| Item | Status | Evidence |
|---|---|---|
| DB + functions pipeline | ⚠️ | #100 merged; GitHub environments + secrets done *(coordinator)*. deploy-prod is blocked by migration `20261101000100` (unclassified definer functions); DB thread fixing. Blocker 1 |
| Web app deploy | ❌ | Not automated. `DEV-PROD-PIPELINE.md` rule 4: "web deploy is not part of this pipeline yet". It's a manual `wrangler deploy` from the owner's machine with a gitignored `apps/web/.env.production`. Worker last modified 2026-08-27 |
| `VITE_*` for prod | ⚠️ | Only on the owner's machine; baked in at build time. Studio legal links now come from the database (#117/#118), so only the platform fallbacks need `VITE_*` |
| Error tracking | ⚠️ owner step | #104, #105, #111 merged (web + edge + source maps). No DSN yet = no alerts until the owner signs up (EU) |
| Uptime monitoring | ❌ follow-up | None found in repo/docs. Free external check on `creativeballet.opalswift.com` + the auth endpoint is enough |
| Cron jobs on prod | ✅ | 9 jobs, `pg_cron` + `pg_net` on. New photographer crons arrive with the migrations |

## 7. Legal / compliance in the app (from `docs/legal/APP-GAPS.md`)

| Gap | Blocks launch? | Why |
|---|---|---|
| Privacy link next to forms that collect data | ✅ (#118) | `PrivacyNotice` on inquiry, booking, quote, pay request, signup, enrolment checkout |
| Enrolment terms checkbox (07a) | ✅ (#118, #117) | Required before payment when the studio has terms; #117 stores acceptances (`legal_acceptances`) |
| Health declaration (07b) | **Yes**, owner step | Prod has no template: load 07b, not the seed waiver. Blocker 5 |
| Per-tenant footer links | ✅ (#118, #117) | Studio links or in-app legal pages from the legal profile; platform `VITE_*` as fallback. #117 and #118 overlap here and are being reconciled by the legal thread |
| Accessibility statement link | ✅ (#118) | Footer link (studio URL or `VITE_ACCESSIBILITY_STATEMENT_URL`) |
| Studio signup Terms/DPA checkbox | ✅ (#117) | Signup checkbox plus a one-time acceptance screen for hand-provisioned studios |
| Marketing consent per channel + unsubscribe | ✅ (#121) | Per-channel opt-in with proof, "פרסומת" prefix, one-click unsubscribe, STOP/הסר replies |
| Photo consent per purpose | ✅ (#121, #112) | Per-purpose records with wording version; Hebrew typo fixed |
| MFA, 24-month access logs, full export | ✅ (#123) | Optional TOTP for admins, audit_log kept 24 months, `export_tenant_data()` |

## 8. Accessibility & i18n

| Item | Status | Evidence |
|---|---|---|
| CI axe suite | ✅ (#119) | Now also scans `/classes`, `/enrol`, `/inquire`, `/book`, `/signup` in en + he. It found unlabeled date-of-birth inputs on enrolment, now fixed. Waiver/quote/pay pages need data, so they're still unscanned |
| Hebrew completeness | ✅ | `enrol_myself` added (#112); en/he key sets match |
| RTL | ✅ | Demo in Hebrew: `dir=rtl`, no English UI text left on 9 screens (only sample data) |

## 9. Other things a CTO would check

| Item | Status | Note |
|---|---|---|
| Ballet school "not a registered business" | ⚠️ | Taking money with no receipts is an accountant question (legal README Q16). The app must not issue documents in its name (`invoicing_provider=none`, #114) |
| Stale functions on prod | ⚠️ | `booking-expiry-sweep` (no in-function auth), `send-otp-email` (no rate limit, gateway-locked). deploy-prod redeploys from git but doesn't delete extras |
| Landing site | ❔ | `opalswift.com` answers 200; no landing Worker in the account list, so check what serves it before linking policies there |
| Demo covers photographer only | ⚠️ | Photographer demo republished (v16); ballet demo in progress *(coordinator)* |
| Seeds on prod | ✅ | Never run (guards in `seed:dev`, rules in every doc) |

---

**Re-check 11:10–11:30:** backup-prod run history checked. prod read-only query (tenants, users, config key names, migrations); merged PR list on `main`; local tests on combined `main` (tsc clean, vitest 1,488/1,488).

**How this was checked (first audit):** repo read at `1d824c5`; PR #100/#103 diffs and check runs; prod read-only queries (tenant/user counts, `platform_config` key *names* only, migrations, cron, buckets), `list_edge_functions`, security advisors; Cloudflare `workers_list`; demo build + Playwright smoke in en/he. No hosted system was written to and no secret value was read.
