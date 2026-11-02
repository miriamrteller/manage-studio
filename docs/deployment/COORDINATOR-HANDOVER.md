# Coordinator handover

Updated 2026-11-02 11:30 UTC by the current coordinator (`session_01CNMzHYVGwEsv37woknUMfi`).
If you are the new coordinator: read this whole file, then do "First actions" at the bottom.

## Your job

You coordinate Claude Code "threads" (separate cloud sessions) that build OpalSwift / manage-studio
for the owner (Miriam). You review their PRs, merge when GitHub CI is green and the diff is right,
run prod releases (the owner approves each one), and keep the owner informed. The owner reads on a
phone: short, plain English, outcome first. English unless asked. British spelling ("enrolment").
**Delegate research to threads** (owner request: keep the coordinator chat uncluttered). Prefer
Sonnet/Opus for new threads; use Fable only when really needed.

## Owner's links

- Launch walkthrough (Claude Doc; finished steps are removed): https://claude.ai/artifact/UQLWxSQwGpWhgGEFaDSLwG
- Ballet demo: https://claude.ai/artifact/UDZuc2KA4ygLaED1hjLSgH · Photographer demo: https://claude.ai/artifact/DgrRLWJjES7nNJjAEXuPfX
- Plans: docs/plans/opalswift-billing-plan.md, docs/plans/LEADS.md
- Legal: docs/legal (lawyer pack: docs/legal/lawyer-pack/OpalSwift-lawyer-pack.pdf, rebuild with `node docs/legal/lawyer-pack/build.mjs`), docs/legal/BUSINESS-REGISTRATION.md

## Threads (tag "launch")

| Thread | Session id | Model | Owns | State 2026-11-02 |
| --- | --- | --- | --- | --- |
| Leads | session_01CNMzHXoNqbNZmd6UutKCMa | Opus | Leads beta P1 | #171 (lead email) and #173 (embed form) merged. Building 2b ready-made + ≤5 custom questions → 2c "Share your form" links + QR → 3 class pipeline → 4 daily follow-up digest. One PR each. |
| Launch guide | session_01CNMzHYe8zjCun8sQp7frSK | Opus | Owner walkthrough doc | Idle unless the owner uses it |
| Database owner | session_01CNMzHa5DtCTddUW4brCgS4 | Opus | Pipelines, DB health, access log | Idle |
| App thread | session_01CNMzHWLPLcyXX4aAMFrswS | Opus | Wizard, platform login, self-serve signup, CAPTCHA tokens | Idle; Worker route for app.creativeballetacademy.com waits for the owner |
| Brand defaults | session_01CNMzHZLFkBzAaP8qi2zV2d | Sonnet | Theme, buttons, emails look | Idle (#155, #159, #172, #174 merged) |
| Marketing site | session_01CNMzHaWHkss2HDbfeZbK9g | Opus | apps/marketing → Pages project `opalswift-il` | #167 "Create your studio" button HELD as draft until self-signup is switched on |
| Billing plan | session_01CNMzHYqvfCp3KNcZM3du7b | Sonnet | Billing/pricing plan doc | Idle |
| Demo (D) | session_01CNMzHZYRxzSidmckhBPWbc | Opus | Demo artifacts | Idle; photographer sync runs 2-hourly (owner's choice) |
| Error tracking | session_01CNMzHYye1dLyc8NrxTk49P | Opus | Sentry | Waiting on the owner's Sentry signup (optional) |

Archived: Launch audit, Legal docs (Fable; un-archive only for legal work; it holds the full legal context).

## How releases work

- Merge to main → deploy-dev runs automatically.
- Prod app: run **deploy-prod** (owner approves), then **deploy-web** (owner approves). deploy-web only
  starts itself after a fully green deploy-prod; while verify:prod is red (encryption key missing),
  start deploy-web by hand.
- **Pending right now:** deploy-prod run 41435093304 (#172 + #173) was approved and is running; then start
  deploy-web. #174 (email gradient on all shells) merged after that run started, so it needs the NEXT
  deploy-prod. Batch it with the next Leads PR.
- Marketing: deploy-marketing on push to apps/marketing/** (owner approves).
- Lead email worker: deploy-lead-email (owner approves). Run 41435138020 with rotate_ingest_secret=true
  is waiting for approval (the first attempt failed with 403; the owner then made token `github-ci-prod`
  with Edge Function Secrets: Read-write). Email Routing catch-all → lead-email-ingest is DONE.
- CI notes: Playwright jobs pinned to ubuntu-24.04; PR runs cancel superseded runs; Edge Functions deploy
  with `--use-api`; Sentry→issues every 3 h.

## Prod state (2026-11-02)

- 1 user: the super admin (miriamrteller@gmail.com, no studio). 0 studios yet.
- Auth: Site URL/redirects set, Send Email hook ON, Turnstile CAPTCHA ON (Supabase + VITE_TURNSTILE_SITE_KEY +
  TURNSTILE_SECRET_KEY), NOTIFICATION_FROM_EMAIL = OpalSwift <no-reply@opalswift.com>.
- Self-serve signup built (#163), OFF (VITE_ENABLE_SELF_SERVE_SIGNUP + SELF_SERVE_SIGNUP_ENABLED). Route
  /create-studio.
- opalswift.com: marketing site in git; /terms, /privacy, /accessibility LIVE (en + he); contact form →
  hello@opalswift.com.
- Encryption key NOT yet in private.platform_config (needed before any studio stores YPay/Grow keys).

## Decisions already made by the owner (don't re-ask)

- Super admin = miriamrteller@gmail.com only (DB-enforced). Studios need a separate owner email.
- Studios are created with the wizard; studio owners get the OpalSwift welcome email (Reply-To hello@).
- Free beta: self-serve "Create your studio", 'trialing' + NULL trial end, signup_source column. Later:
  30-day trial with card via Grow after OpalSwift registers as a business (likely עוסק פטור; see
  BUSINESS-REGISTRATION.md). Grow partner programme 500 ₪ + VAT/month, unlimited studios.
- Defaults: English, OpalSwift theme (#5B6CFF / #21D1C2, AA ink #4A58E8), gradient primary buttons, dark
  side menu with accent glow. Per-skin defaults later. App always defaults to English. "Studio not found"
  for unknown hosts.
- Wording: dance "health declaration", photographer "contract", others "form"; never "waiver".
- Legal (platform terms): operator "Miriam Teller, trading as OpalSwift", Jerusalem, Beta 1.0; support
  hello@opalswift.com, reply within a week, phone hours Sun + Tue 09–10 and 20–21; phone "coming soon"
  until she gets a virtual number; liability cap = greater of ₪1,000 and 12 months' fees; disputes:
  arbitration before Beit Din "Darkei Torah" (Rav Asher Weiss), Jerusalem, B2B terms only; notice periods
  30/14/7 days; retention 24 months (7 years financial). Lawyer review is the last step.
- Creative Ballet: subdomain `creativeballet`, dance, pay at the studio, invoicing none. Photographer: YPay
  (Tuesday meeting). app.creativeballetacademy.com later, walked through with the owner.
- Leads are per studio: leads-<sub>@opalswift.com, /inquire + /embed/inquire, ready-made questions per
  vertical + ≤5 custom, share links + QR per channel. P2: Meta lead ads, WhatsApp click-to-chat. P3:
  Instagram DMs. Google Forms only as a documented fallback.
- Repo stays public during build-out; go private later with a spend cap.

## Open for the owner (2026-11-02)

1. Approve deploy-lead-email (41435138020) and the deploy-web that follows the running deploy-prod.
2. Create Creative Ballet via "Set up a new studio"; test leads-creativeballet@opalswift.com.
3. Before Tuesday: encryption key, then one all-green deploy-prod.
4. Virtual phone number (then update docs/legal 01 §7 + OpalSwift 06 and regenerate /terms, /accessibility).
5. Send the lawyer pack; ask the accountant whether Creative Ballet must be עוסק מורשה.
6. When ready: switch on self-signup (docs/deployment/SELF-SERVE-SIGNUP.md), then merge #167.
7. Later: prices (billing plan), Grow questions, Sentry, Supabase Pro, uptime monitor, old Cloudflare
   tokens clean-up.

## Rules

- Never paste or print secrets. If the owner pastes one, tell them to rotate it.
- Never run db reset or seeds on hosted projects; never write to prod outside the pipeline. The Supabase
  MCP connector is READ-ONLY (SELECTs to verify state are fine).
- Unset `*_MOCK` flags in prod. No images containing people.
- Threads push only to their own branch, open draft PRs, one open PR per thread; you merge green PRs.
- Migrations use real UTC timestamps; SECURITY DEFINER functions go in supabase/security/definer-execute.json.
- Keep the owner's usage low: idle threads stay idle.

## First actions for a new coordinator

1. Message each active thread: "Coordinator changed: report to session <your id> from now on."
2. Check open PRs and pending deploy runs; continue "Open for the owner" and the Leads queue.
3. Tell the owner the handover is done, in two lines, and what you're waiting on.
