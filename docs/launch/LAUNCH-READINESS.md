# Launch readiness audit

**Updated:** 2026-11-01 11:15 · **Code:** `main` @ `a67a83c` · **Prod:** read-only re-check at 11:10 (still 0 tenants, 0 users, 34 migrations, no encryption key) · **Scope:** first two tenants (ballet school: pay at the studio, no receipts; photographer: YPay).
First version: 2026-11-01 09:45 @ `1d824c5` (#110).

## Verdict: code is ready; the remaining blockers are owner setup steps on prod

**Done since the first audit:** #103 security hardening (blocker 8), #114 pay at the studio + invoicing off (blocker 4), #118 + #117 legal links, privacy notice, terms checkbox with stored acceptance (blocker 7), #112/#116 Resend allowed as the email transport, #119 axe scan of public pages + photographer RLS checks, #105/#111 Sentry.

Still open, in launch order:
1. **Prod is behind `main`:** 34 of 43 migrations; Edge Functions and the web Worker are from August. → owner creates GitHub environments + secrets, runs **deploy-prod**, then rebuilds and deploys the web app (still manual). *Owner + launch guide*
2. **Email:** Resend is the decision (#115). Set `RESEND_API_KEY` + `EMAIL_TRANSPORT=resend` on prod and verify opalswift.com in Resend. Login is by email, so nothing works without it. *Not verifiable from here (secret names aren't readable via SQL).* *Owner*
3. **Encryption key** not set on prod (only `cron_secret`, `supabase_functions_url`). *Owner*
4. **Backups:** move to Supabase Pro, re-run backup-prod (last ran 27 Oct), check one restore. *Owner + launch guide*
5. **Bootstrap the ballet school:** after `provision_tenant`, set `payment_provider='offline'`, `invoicing_provider='none'` (GO-LIVE-PLAN Phase B), load the 07b health declaration in Admin → Setup → Waivers, and fill in the legal profile / links in Settings. *Owner + launch guide*

Everything else below is Covered, or a Risk that can follow launch.

Legend: ✅ Covered · ❌ Gap (needs work) · ⚠️ Risk (watch, or fix soon after launch) · ❔ Not verified

---

## 1. Core flows

| Flow | Status | Evidence |
|---|---|---|
| Photographer: lead → quote → accept → contract sign + PDF → deposit → balance → gallery → client portal | ✅ code + demo | Demo build (`VITE_DEMO_MODE=true`) + Playwright: `/admin/jobs`, `/admin/leads`, `/admin/quotes`, `/dashboard`, `/inquire` all render, 0 page errors, en + he. Functions in `supabase/functions/{accept-quote,send-job-contract-link,job-contract-pdf-generate,record-job-payment,job-payment-request-public}` |
| Photographer on prod | ❌ until deploy | None of those functions are deployed to prod yet (Aug versions only). Blocker 1 |
| Dance: class list → enrolment → health declaration → payment → parent portal | ⚠️ code only | The demo is photographer-only (`src/demo/main.tsx` starts at `#/admin/jobs`), so the dance flow can't be clicked through without a backend. Unit tests + `e2e/enrolment-features.spec.ts` need Supabase |
| Dance: parent pays at the studio | ✅ (#114) | `payment_provider='offline'`: checkout shows "Pay at the studio" (`OfflinePaymentNotice.tsx`), the place stays pending until an admin clicks Record offline payment. Set at bootstrap (blocker 5) |
| Dance: waiver step on prod | ❌ until key + template | `accept-waiver` needs `WAIVER_HMAC_KEY_V1` (deploy-prod checks it) and the DB encryption key. No `consent_templates` row is created by any migration: load 07b. Blockers 3, 5 |
| Admin basics: login, settings, branding, notifications | ✅ demo | `/login`, `/admin/setup/settings`, `/admin/notifications` render en + he, RTL |

## 2. Auth & tenancy

| Item | Status | Evidence |
|---|---|---|
| Magic-link login | ❌ until email | Auth Send Email hook → `send-auth-email` is live on prod; it needs the Resend secrets. Blocker 2 |
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
| Transport | ⚠️ owner step | Decision: Resend (#115). `EMAIL_TRANSPORT=resend` + `RESEND_API_KEY` on prod; Cloudflare later is a config switch. Blocker 2 |
| Secret manifest vs Resend | ✅ (#112, #116) | deploy-prod's secret check accepts Resend-only prod |
| Templates en/he + RTL | ✅ | All dance and photographer templates take a language; `BaseEmailTemplate.tsx:127` sets `lang`/`dir` |
| Sender domains | ✅ | `resolveTenantSender()`: tenant first, `<subdomain>@opalswift.com` fallback, Reply-To = studio |
| Silent failures if sending is down | ⚠️ | Sends throw and are audited (`payment_confirmation_email_skipped`), but nobody is paged. Login just "never arrives". Sentry PR #105 would surface them |
| Contract PDF attachment | ⚠️ | Cloudflare transport sends a link only (`supportsAttachments()`). Known, acceptable |
| Unsubscribe line in marketing email | ❌ follow-up | APP-GAPS. Blast composer is "marketing": don't use it until fixed, or only for service messages |

## 5. Data safety

| Item | Status | Evidence |
|---|---|---|
| Supabase plan | ❌ owner step | Prod org still to move to Pro: no daily backups or PITR until then. Blocker 4 |
| Nightly R2 backup | ⚠️ | Last ran 27 Oct (Actions minutes). #100 fixes migration history and adds a pre-deploy backup |
| Restore runbook + rehearsal | ✅ | `BACKUP-RESTORE-RUNBOOK.md`; `scripts/restore-rehearsal.sh` (#100), rehearsed 2026-11-01 |
| Storage files (waiver/contract PDFs, logos) | ⚠️ | Not in any backup (runbook "Known gap"). Signed contracts live only in bucket `legal-documents` |
| DB encryption key | ❌ owner step | Re-checked 11:10: `private.platform_config` still has only `cron_secret`, `supabase_functions_url`. No re-encrypt path: store it in the password manager first. Blocker 3 |
| Backup gpg private key | ✅ | Password manager only (runbook) |
| Drift / health checks | ✅ (after #100) | `db-health.yml` nightly: drift dev + prod, advisors → `db-drift` issue |

## 6. Ops

| Item | Status | Evidence |
|---|---|---|
| DB + functions pipeline | ✅ merged (#100) | Still to do: GitHub environments + secrets, then the first deploy-prod run. deploy-dev runs on merge but finishes in seconds, so it likely skips until the environments exist. Blocker 1 |
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
| Studio signup Terms/DPA checkbox | No | Self-serve signup is gated off; first two tenants are provisioned by hand (sign on paper/email) |
| Marketing consent per channel + unsubscribe | No, if no marketing sends | Don't use the blast composer for marketing until done |
| Photo consent per purpose | Soon | Hebrew typo "מנתן" fixed (#112); per-purpose consent still open (APP-GAPS) |
| MFA, 24-month access logs, full export | No | Post-launch |

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
| Demo covers photographer only | ⚠️ | A dance demo would let the owner rehearse the ballet flow without prod |
| Seeds on prod | ✅ | Never run (guards in `seed:dev`, rules in every doc) |

---

**Re-check 11:10:** prod read-only query (tenants, users, config key names, migrations); merged PR list on `main`; local tests on combined `main` (tsc clean, vitest 1,488/1,488).

**How this was checked (first audit):** repo read at `1d824c5`; PR #100/#103 diffs and check runs; prod read-only queries (tenant/user counts, `platform_config` key *names* only, migrations, cron, buckets), `list_edge_functions`, security advisors; Cloudflare `workers_list`; demo build + Playwright smoke in en/he. No hosted system was written to and no secret value was read.
