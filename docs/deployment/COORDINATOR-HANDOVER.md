# Coordinator handover

Written 2026-11-01 by the outgoing coordinator session (`session_01CNMzHZz6ZodEZ6p7v17QLd`).
Updated 2026-11-01 by the current coordinator (`session_01CNMzHYVGwEsv37woknUMfi`).
If you are the new coordinator: read this whole file, then do "First actions" at the bottom.

## Your job

You coordinate Claude Code "threads" (separate cloud sessions) that build OpalSwift / manage-studio
for the owner (Miriam). You review their PRs, merge when GitHub CI is green, keep the browser demo
current, and keep the owner's walkthrough doc accurate. The owner reads on a phone: short, plain
English, outcome first. English unless the owner asks for Hebrew.

## Owner's links

- Launch walkthrough (Claude Doc, the owner's checklist): https://claude.ai/artifact/UQLWxSQwGpWhgGEFaDSLwG
- Photographer demo (browser-only, kept on main by thread D): https://claude.ai/artifact/DgrRLWJjES7nNJjAEXuPfX
- Soft-theme design mockup: https://claude.ai/artifact/C7emiFjZcJq2qdiMJqqjiZ

## Active threads (tag "launch")

| Thread | Session id | Owns | State on 2026-11-01 |
| --- | --- | --- | --- |
| Launch guide | session_01CNMzHYe8zjCun8sQp7frSK | Walks the owner through the walkthrough doc one step at a time; ticks it off | Waiting on owner: Supabase Pro upgrade. Waiting on you: tell it when #100 merges (then it walks the owner through GitHub environments/secrets) |
| Database owner | session_01CNMzHa5DtCTddUW4brCgS4 | Dev→prod pipeline, security hardening, DB health, first prod release | #100 pipeline (local-stack CI still red, it is fixing); #103 security hardening stacked on #100 |
| Error tracking | session_01CNMzHYye1dLyc8NrxTk49P | Sentry (EU, free), admin "Report a problem", Sentry→GitHub issues | PR 1 merged (#104). Building PR 2 (edge-function wrapper), then 3 (feedback), 4 (CI source maps + issue Action + OBSERVABILITY.md) |
| Legal docs | session_01CNMzHWVdy3dV55o2MV1S6n | Israeli legal docs (merged #101), per-tenant legal setup, open questions | Writing TENANT-LEGAL-SETUP.md + trimming open questions to ≤5 (owner said the docs are too long) |
| Demo (D) | session_01CNMzHZYRxzSidmckhBPWbc | Republishes the demo artifact from main; has a 2-hourly sync task | Asked to republish after #99/#101/#102 |
| Launch audit | session_01CNMzHXYhnF8C2TwWiBr4cv | Independent launch-readiness check → docs/launch/LAUNCH-READINESS.md with a short blocker list | Done (#110 merged). Idle |
| App thread | session_01CNMzHWLPLcyXX4aAMFrswS | Ballet launch gaps: offline "pay at the studio", invoicing-off setting, per-tenant legal links + enrolment-terms checkbox, then custom-domain support | Started 2026-11-01 10:14; PR 1 (offline payments) first |

All threads report to `session_01CNMzHYVGwEsv37woknUMfi` (re-pointed 2026-11-01 09:41).

## Open PRs

None as of 2026-11-01 10:15. Merged today: #100, #103, #105–#111, #113. Expected next:
- DB owner: make the Cloudflare email secrets optional in `supabase/edge-secrets.json` (Resend-only prod must pass deploy-prod's check).
- Legal: English-prevails + free-until-registered applied to the docs; short insurance section.
- Demo (D): ballet-studio demo artifact (separate from the photographer one).
- App thread: PRs 1–4 above.

## Decisions already made by the owner (don't re-ask)

- Dance tenants on YPay also get offline (cash/bank) receipts (#87).
- Soft gradient theme is the default for ALL tenants, incl. dance; tenants can switch header/footer to Solid (#91).
- "Studio" is the default wording for all tenants (not "school"); tenant custom labels still override (#95).
- Photographer people are "Clients" (#99); no dance wording on photographer screens (#97, #98, #102).
- Merge rule: merge a thread's PR when GitHub CI is green and the diff looks right ("merge when done"). Dance behaviour must not change unless the owner decided it.
- Dev Supabase (org miriamrteller, ref acmujrhavgbamdilzuew) stays Free. Prod (org OpalSwift, `manage-studio-prod`, ref oogxajjanbyqhljxcmql, Frankfurt) goes Pro.
- DB changes go only through the GitHub pipeline; prod only with the owner's approval. The Supabase MCP connector (prod org only) is READ-ONLY for us.
- Sentry: EU region, free plan, Replay off, admin-only "Report a problem" item (not a floating button).
- Email transport at launch is **Resend** (`EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`), not Cloudflare Workers Paid. Switching later = `EMAIL_TRANSPORT=cloudflare` + the two Cloudflare secrets; no code change.
- Ballet school domain is **creativeballetacademy.com** (owner's own). Custom domains aren't supported yet, so launch on `creativeballet.opalswift.com` with a Cloudflare redirect from the .com; the app thread builds custom-domain support after its first three PRs.
- Legal: OpalSwift stays free until registered as an עוסק; the **English** version of each document prevails.
- Owner wants to try a ballet-studio demo before the photographer meeting (Tuesday). Photographer details are collected at that meeting.
- App thread approved for: offline "pay at the studio" checkout, invoicing-off setting, per-tenant legal links + enrolment-terms checkbox.
- First prod tenants: the owner's ballet school "Creative Ballet Academy" (subdomain `creativeballet`, dance-studio, NOT a registered business yet: manual payments only, receipts/invoicing OFF), then the photographer friend (YPay, set up before their meeting).

## Facts about prod (read-only check, 2026-11-01)

- Empty: 0 tenants, 0 users. 34 migrations applied; main has 41+ (6 photographer-beta + #91 theme + #103 when merged).
- No encryption key yet in `private.platform_config` (only cron_secret, supabase_functions_url). The owner generates it and runs the one-line INSERT themselves; never echo it.
- Edge functions are from late August; all photographer/quote/contract/receipt functions missing.
- Cloudflare Worker `opalswift-app` serves `*.opalswift.com`. Cloudflare account is on Workers FREE, so Email Sending does not work until the owner upgrades to Workers Paid ($5/mo).
- Nightly `backup-prod` last ran 27 Oct (GitHub Actions minutes ran out 30–31 Oct; Actions resumed 1 Nov). The launch guide will have the owner re-run it once.

## Owner's to-do (also in the walkthrough doc)

1. Supabase OpalSwift org → Pro.
2. Resend: sign up, verify opalswift.com, API key → Supabase prod Edge secrets `RESEND_API_KEY` + `EMAIL_TRANSPORT=resend`. (Workers Paid only if/when switching to Cloudflare email.)
3. GitHub environments "production" (required reviewer = owner) and "development" with secrets (steps in `docs/deployment/DEV-PROD-PIPELINE.md`).
4. Sentry signup (EU region) when the error-tracking thread sends steps.
5. Add creativeballetacademy.com to Cloudflare and redirect it to creativeballet.opalswift.com until custom domains ship.
6. Fill legal placeholders; lawyer review of platform terms + DPA; accountant on business registration.
7. Photographer: everything at the Tuesday meeting (subdomain, sign-in email, business name, packages, YPay keys).

## Order of the launch

#100 + #103 merged → owner setup → deploy-prod dry run → real run → encryption key → owner account → creativeballet bootstrap (each SQL step shown to the owner first) → email sending on → website deploy → test enrolment → photographer tenant → meeting (YPay keys, ₪1 live test, full sample booking).

## Follow-ups not started

- Insurance for the ballet school and teachers: legal thread is writing a short section (requested 2026-11-01).
- `docs/legal/APP-GAPS.md`: app changes the legal docs need (per-studio footer legal links, terms/privacy checkbox at signup and enrolment, marketing consent with channel/time/wording + unsubscribe line, photo-consent purpose + Hebrew typo "מנתן", privacy link on public forms). The app thread (above) owns the launch-blocking part; the rest must feed the planned automatic onboarding.
- Replace the dance seed "Health & Liability Waiver" (bundled release is presumed unfair) with the health declaration (07b) + separate photo opt-in.
- RLS performance rewrite (auth_rls_initplan 46, multiple_permissive_policies 675): separate PR, after launch.
- Contract PDFs aren't attached on the Cloudflare email transport (link only); contracts signed before #86 have no PDF.
- esm.sh → npm: migration for edge functions (a reminder was set for 16 Nov).
- Stray remote branch `fix/light-color-scheme` (already merged as #94) can be deleted.

## Rules

- Never paste or print secrets, keys, passwords or connection strings. If the owner pastes one, tell them to rotate it.
- Never run db reset or seeds on hosted projects. Never write to prod outside the pipeline.
- Unset `*_MOCK` flags in prod (YPAY_MOCK especially).
- No images containing people.
- Push only to your own designated branch; open draft PRs; merge only green PRs.

## First actions for a new coordinator (done 2026-11-01 by the current one; repeat if you take over)

1. Send each active thread (table above) one message: "Coordinator changed: report to session <your id> from now on."
2. Check #100 / #103 CI; merge when green; tell the launch guide when #100 merges.
3. Tell the owner the handover is done, in two lines, and what you're waiting on.
