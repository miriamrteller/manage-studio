# Coordinator handover

Updated 2026-11-02 by the current coordinator (`session_01CNMzHYVGwEsv37woknUMfi`).
If you are the new coordinator: read this whole file, then do "First actions" at the bottom.

## Your job

You coordinate Claude Code "threads" (separate cloud sessions) that build OpalSwift / manage-studio
for the owner (Miriam). You review their PRs, merge when GitHub CI is green and the diff is right,
run prod releases (the owner approves each one), and keep the owner's walkthrough doc accurate
through the launch guide. The owner reads on a phone: short, plain English, outcome first. English
unless the owner asks for Hebrew. British spelling in the app ("enrolment").

## Owner's links

- Launch walkthrough (Claude Doc; finished steps are removed, not ticked): https://claude.ai/artifact/UQLWxSQwGpWhgGEFaDSLwG
- Ballet demo (browser-only): https://claude.ai/artifact/UDZuc2KA4ygLaED1hjLSgH
- Photographer demo (browser-only): https://claude.ai/artifact/DgrRLWJjES7nNJjAEXuPfX
- Billing plan: docs/plans/opalswift-billing-plan.md

## Threads (tag "launch")

| Thread | Session id | Model | Owns | State 2026-11-02 |
| --- | --- | --- | --- | --- |
| Launch guide | session_01CNMzHYe8zjCun8sQp7frSK | Opus | Walks the owner through the walkthrough doc | Active |
| Database owner | session_01CNMzHa5DtCTddUW4brCgS4 | Opus | Pipelines (deploy-dev/prod/web), DB health, access log | Idle |
| App thread | session_01CNMzHWLPLcyXX4aAMFrswS | Opus | App features: wizard, platform login, self-serve signup | Building self-serve studio signup; next: Turnstile tokens on the 5 login forms |
| Brand defaults | session_01CNMzHZLFkBzAaP8qi2zV2d | Sonnet | Theme tokens, favicon, buttons/alerts/tabs polish | Idle (#155, #159 merged) |
| Billing plan | session_01CNMzHYqvfCp3KNcZM3du7b | Sonnet | docs/plans/opalswift-billing-plan.md | #160: adding pricing research + full cost table |
| Legal docs | session_01CNMzHWVdy3dV55o2MV1S6n | Fable | Israeli legal docs | Un-archived: beta liability audit, access-log line, beta checklist, BUSINESS-REGISTRATION.md |
| Marketing site | session_01CNMzHaWHkss2HDbfeZbK9g | Opus | apps/marketing → Pages project `opalswift-il` | Idle; next: /terms, /privacy pages + "Create your studio" button |
| Demo (D) | session_01CNMzHZYRxzSidmckhBPWbc | Opus | Demo artifacts from main | Idle; 2-hourly sync left on by the owner |
| Error tracking | session_01CNMzHYye1dLyc8NrxTk49P | Opus | Sentry | Waiting on the owner's Sentry signup |

Archived: Launch audit. The owner prefers cheaper models (Sonnet) for new threads unless the task needs more.

## How releases work

- Merge to main → deploy-dev runs automatically (dev Supabase `acmujrhavgbamdilzuew`).
- Prod: run deploy-prod (owner approves), then deploy-web (owner approves). deploy-web only starts
  itself after a fully green deploy-prod, so while verify:prod is red, start deploy-web by hand.
- verify:prod stays red until the encryption key is in `private.platform_config` (owner adds it before
  Tuesday's photographer meeting, then one all-green re-run). Everything else on prod is green.
- Marketing site: deploy-marketing on push to apps/marketing/** (owner approves). Contact form =
  Pages Function → Resend → hello@opalswift.com (Cloudflare Email Routing → owner's Gmail).
- CI: Playwright jobs pinned to ubuntu-24.04; PR runs cancel superseded runs; Edge Functions deploy
  with `--use-api` (no Docker pulls).

## Decisions already made by the owner (don't re-ask)

- Super admin = miriamrteller@gmail.com only (DB-enforced). She signs in on app.opalswift.com; her
  profile has no studio. Studios need a SEPARATE owner email (the wizard refuses hers).
- Studios are created with the in-app wizard ("Set up a new studio"), never hand-run SQL. Studio owners
  get an OpalSwift welcome email (Reply-To hello@opalswift.com).
- Self-serve "Create your studio" for the free beta: building now; stays behind
  VITE_ENABLE_SELF_SERVE_SIGNUP until legal + Turnstile are ready. Free beta = sub_status 'trialing',
  trial_ends_at NULL. Later: 30-day trial with card, auto-billed via Grow, after OpalSwift is a
  registered business (Grow partner programme: 500 ₪ + VAT/month, unlimited studios).
- Defaults for new studios: English, OpalSwift theme (#5B6CFF / #21D1C2, AA ink #4A58E8), dark side menu
  with a subtle accent glow (Soft) or flat (Solid). Per-skin defaults come later.
- App always defaults to English (no browser detection). Unknown subdomains show "Studio not found".
  Studio name falls back to the subdomain.
- Wording: dance = "health declaration" / "הצהרת בריאות"; photographers = "contract"; others = "form".
  Never "waiver" to parents/clients.
- Creative Ballet Academy: subdomain `creativeballet`, pay at the studio (offline), invoicing none,
  separate owner email. Photographer: YPay (Tuesday meeting). app.creativeballetacademy.com later,
  walked through with the owner.
- Email: Resend. NOTIFICATION_FROM_EMAIL should be `OpalSwift <no-reply@opalswift.com>`.
- Legal: free beta; English prevails; lawyer review is the last step per studio.
- Repo stays public during build-out (free Actions minutes); go private later with trimming + a spend cap.
- Sentry→GitHub issues every 3 hours (Israeli daytime).
- Platform access log (#148) is permanent; studios see it under Settings → Security.

## Open for all studios (2026-11-02)

1. Release: deploy-prod + deploy-web with #156 (welcome email) and #159 (polish). Then the owner
   creates Creative Ballet through the wizard.
2. Self-serve signup PR (app thread), then the Turnstile tokens PR, then the owner enables Supabase
   CAPTCHA and the signup flag.
3. Legal beta audit (legal thread), then /terms and /privacy on opalswift.com (marketing thread) and the
   VITE_TERMS_URL / VITE_PRIVACY_POLICY_URL production variables.
4. "Create your studio" button on opalswift.com once signup is live.
5. Owner: NOTIFICATION_FROM_EMAIL value; marketing-form test; Gmail 2-step; encryption key before
   Tuesday; optional Gmail "Send mail as" hello@, Sentry, Supabase Pro, uptime monitor, old Cloudflare
   token clean-up.

## Rules

- Never paste or print secrets, keys, passwords or connection strings. If the owner pastes one, tell
  them to rotate it.
- Never run db reset or seeds on hosted projects. Never write to prod outside the pipeline. The
  Supabase MCP connector is READ-ONLY for us (SELECTs to verify state are fine).
- Unset `*_MOCK` flags in prod. No images containing people.
- Threads push only to their own branch and open draft PRs; you merge green PRs. One open PR per thread.
- Migrations use real UTC timestamps; SECURITY DEFINER functions go in supabase/security/definer-execute.json.
- Keep the owner's Claude usage low: idle threads stay idle; no unnecessary subagents.

## First actions for a new coordinator

1. Send each active thread one message: "Coordinator changed: report to session <your id> from now on."
2. List open PRs and pending deploy runs; continue the "Open for all studios" list.
3. Tell the owner the handover is done, in two lines, and what you're waiting on.
