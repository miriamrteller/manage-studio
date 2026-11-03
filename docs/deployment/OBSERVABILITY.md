# Observability: how we find out when something breaks

**Short version:** when the app or a server function throws an error, Sentry emails you within a minute.
Studio admins can also press **Report a problem** in the menu. Every 3 hours (Israeli daytime), every new
error or report becomes a GitHub issue that you can hand to an AI agent ("fix issue #123").

Nothing is sent anywhere until you finish the setup below. Until then the code is switched off.

| Piece | What it does | Cost |
|---|---|---|
| Sentry (EU region, Frankfurt) | Collects errors from the web app and the Supabase edge functions, and "Report a problem" messages. Emails you about new and returning errors, plus a weekly summary. | Free "Developer" plan: 1 user, about 5,000 errors a month. Next step up is the Team plan, about $26/month, only if you outgrow it. |
| GitHub Action "Sentry → GitHub issues" | Turns each new Sentry issue into a GitHub issue with the studio id, page, release and a link to the exact commit. | Free (about 15 short runs a day). |
| Cloudflare Workers Observability | Request logs for the website itself. Already on. | Free |
| Supabase logs | Database and edge-function logs, for deep dives. Already on. | Included |
| Uptime check (optional) | Emails you if the site stops answering at all. | Free (Better Stack or UptimeRobot) |

---

## One-time setup (about 15 minutes)

You need: the Supabase dashboard and GitHub repository settings (the website is built by GitHub, not Cloudflare). Keep a
notes file open, because you will copy four values: **DSN**, **token**, **org slug** and **project slug**.

### 1. Create the Sentry account. Pick the EU region.

1. Go to <https://sentry.io/signup/> and sign up (Google sign-in is fine).
2. When it asks for **Data Storage Location**, choose **European Union (EU)**.
   **This cannot be changed later**, and our privacy documents say the data is stored in the EU.
3. Name the organization `opalswift`. The web address it shows (`opalswift`) is your **org slug**; write it down.
4. If it offers a paid trial, you can ignore it. The account drops to the free Developer plan by itself.

### 2. Create one project

1. **Projects → Create Project**.
2. Platform: **React**.
3. "Set your alert frequency": choose **Alert me on every new issue**.
4. Project name: `opalswift-app`. This is your **project slug**; write it down. Then click **Create Project**.
5. Sentry now shows setup instructions with a line like `dsn: "https://…ingest.de.sentry.io/…"`.
   Copy that URL: it's your **DSN**. You can skip the rest of Sentry's instructions; the code is already written.
   You can find the DSN again later under **Settings → Projects → opalswift-app → Client Keys (DSN)**.

One project covers both the website and the edge functions. Edge errors are tagged with the function name.

### 3. Privacy switches (required)

In Sentry, open **Settings → Security & Privacy** (organization settings) and turn on:

- **Data Scrubber**
- **Use Default Scrubbers**
- **Prevent Storing of IP Addresses**

Then download Sentry's Data Processing Addendum for your records from <https://sentry.io/legal/dpa/>.
Sentry is listed as a sub-processor in our DPA.

### 4. Create a token (for readable stack traces and the GitHub issues)

1. Click your avatar (bottom left) → **User Settings → Personal Tokens** (also called User Auth Tokens) → **Create New Token**.
2. Tick these scopes and nothing else: **event:read**, **org:read**, **project:read**, **project:releases**.
3. Create it and copy the **token**. Sentry shows it only once.

### 5. Paste the values in three places

**GitHub, website build**: the web app is built and deployed by the `deploy-web` workflow
(see [DEV-PROD-PIPELINE.md](DEV-PROD-PIPELINE.md#web-stage)), not by Cloudflare. Repository
**Settings → Environments → production → Variables → Add variable**: `VITE_SENTRY_DSN` = the DSN.
The source-map upload reuses `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` from the
**GitHub (issues)** step below, so nothing else is needed. Changing the DSN takes effect at the next
web deploy (Actions → deploy-web → Run workflow).

Do **not** connect Cloudflare's own Git builds (Workers Builds) for `opalswift-app`: it would deploy
every push to `main` straight away, before the matching database migrations reach prod.

**Supabase** (edge functions): **Project → Edge Functions → Secrets** (or *Manage secrets*). Add
`SENTRY_DSN` with the same DSN. Optionally add `SENTRY_ENVIRONMENT` = `production`. No redeploy is needed.
If you use the repo `.env` file, `pnpm secrets:edge` copies `SENTRY_DSN` across too.

**GitHub** (issues): repository **Settings → Secrets and variables → Actions**.
- **Secrets** tab → **New repository secret**: `SENTRY_AUTH_TOKEN` = the token.
- **Variables** tab → **New repository variable**: `SENTRY_ORG` = org slug, and `SENTRY_PROJECT` = `opalswift-app`.

### 6. Alerts

The "every new issue" alert from step 2 already emails you. Add two more in Sentry under **Alerts → Create Alert**:

1. **Regression.** Issues, when "the issue changes state from resolved to unresolved", send an email to you.
2. **Spike.** Issues, when "the issue is seen more than 50 times in 1 hour", send an email to you.

For the weekly summary: **User Settings → Notifications → Weekly Reports**, turn on.

### 7. Check it works

1. Make sure a web deploy has run since you added `VITE_SENTRY_DSN` (Actions → deploy-web). Then sign in to the app as a studio admin. Open the menu → **Report a problem** → type `test` → **Send report**.
2. In Sentry, open **User Feedback**. The message appears within a minute or so.
3. In GitHub, open **Actions → "Sentry → GitHub issues" → Run workflow**. A GitHub issue labeled
   `problem-report` appears. Close it.

### 8. Optional: uptime check

At <https://betterstack.com/uptime> (free) or <https://uptimerobot.com> (free), add an HTTP monitor
for `https://app.opalswift.com` every 3–5 minutes with email alerts. It only loads the public page, so no
personal data is involved.

---

## Day to day

- **Email from Sentry:** something broke for someone. Open the link to see which page or function, which studio
  (tenant id), how many times, and the stack trace.
- **GitHub issue labeled `sentry`:** the same information, prepared for an agent. Start a Claude session on the
  repo and say *"Fix GitHub issue #123"*. When the fix is deployed, click **Resolve** in Sentry. If it happens
  again, Sentry reopens it and emails you ("regression").
- **GitHub issue labeled `problem-report`:** a studio admin wrote to you. The text is in the issue.
  To reply, look up the studio by the tenant id. We deliberately don't collect the person's name or email.
- **Noise:** in Sentry you can **Ignore** an issue that isn't worth fixing (for example, a browser extension error).

Errors and problem reports appear in Sentry immediately. The GitHub issue follows within 3 hours. To get it
sooner, run the workflow by hand.

## What data leaves our systems (and what never does)

Sent to Sentry (EU):
- the error message, with emails, phone numbers, tokens and database values masked;
- the stack trace (file and line);
- the page as a template (`/admin/jobs/:id`, never real ids or the secret tokens in `/pay/…` and `/quote/…` links);
- browser and OS;
- app release (git commit);
- the studio's tenant id, the person's internal user id and their role;
- for problem reports, the text the admin typed (also masked);
- for problem reports, **one screenshot, only if the admin chooses to attach it** (see below).

Never sent: names, emails, phone numbers, IP addresses, cookies, form contents, request or response bodies,
payment details, health details, children's data, or any automatic screen capture or screen recording.
Session Replay is off.

### Optional screenshot on a problem report

In **Report a problem** the admin can press **Attach a screenshot** and pick one image file themselves.
Nothing is captured automatically, and there is no feedback-widget or replay code.

- Allowed: PNG, JPG or WebP, up to 5 MB. The file's content must match its type, so a renamed document is refused.
- Next to the button the admin sees: "Screenshots may show students' details. Only attach one if it helps."
  (Hebrew: the same, in `report_problem.screenshot_warning`.) They can remove the file before sending.
- The image goes to Sentry as an attachment on the problem report (`captureFeedback` with the `attachments` hint).
  It is stored in Sentry's EU region with the report, and shows with it in Sentry under **User Feedback**.
  It is **not** copied into the GitHub issue, so AI agents working from GitHub issues never see it.
- The text scrubbing is unchanged and **does not look inside images**: the Data Scrubber cannot blank out a name
  that appears in a picture. That is why the warning is shown. Phone photos can also carry hidden metadata
  (such as location); a screenshot taken on a computer normally does not.
- The file's own name is replaced with `screenshot.png`, `.jpg` or `.webp` before sending, because file names can contain people's names.
- Attachments count against Sentry's separate attachment quota, not the error quota.
- If a report includes a screenshot with a child's or student's details, delete the report in Sentry once it has been dealt with.

Two optional helpers sit next to the button. Both reduce, but do not remove, the chance of personal data in an image, so the warning stays:

- **Hide details:** after an image is attached, the admin can draw solid black boxes over it (mouse, touch or keyboard). Pressing Done burns the boxes into the pixels and re-encodes the image as a new PNG, which also drops hidden metadata. Skipping it sends the image as attached.
- **Snapshot with text hidden:** takes a picture of the page behind the dialog, built in the app from the page itself (no OCR, no capture library): all text and form values are replaced by solid blocks and images are blocked out, while layout and colours are kept. It covers the visible part of the page only. If a browser cannot draw it, the admin is told and can attach a screenshot instead.

Both load only when used (separate small chunks, about 5 KB gzip together), so they add nothing to the normal app load.

**DPA:** the Sentry sub-processor row in the DPA (`docs/legal/02-dpa.en.md` and `.he.md`) now says that screenshots are sent only when a studio admin chooses to attach one, that the admin can black out details or send a text-hidden snapshot first, and that a screenshot may still show personal data on that screen. It ships with this feature. The wording still needs the lawyer's review like the rest of the DPA draft.

GitHub issues contain the same fields (no personal data). Text copied from errors and reports is marked as
untrusted, because anyone can trigger an error with odd text in it.

## Turning it off

Delete `VITE_SENTRY_DSN` (GitHub → Settings → Environments → production → Variables) and run deploy-web again, and delete `SENTRY_DSN` in Supabase. Everything goes quiet,
and the "Report a problem" menu item disappears. To stop the GitHub issues, delete the GitHub secret, or disable
the workflow in the Actions tab.

## Limits

- **Free plan:** about 5,000 errors a month. If a bug floods it, Sentry drops the extra events until the month resets.
  You'll still have the first ones, plus the email. If this happens often, fix the noisy bug or move to the Team plan.
- Only one Sentry user on the free plan (you). AI agents work from the GitHub issues, not from Sentry directly.
- The source code shown in Sentry stack traces is uploaded at build time and is **not** served to visitors.

---

## For developers

- **Frontend:** `apps/web/src/lib/monitoring/`.
  - `index.ts` holds init (lazy, only when a DSN is set), `reportError()`, `sendProblemReport(message, screenshot?)`,
    `checkScreenshot()` (type, 5 MB cap, file signature) and `canReportProblems()`.
    `pageSnapshot.ts` builds the text-hidden snapshot; `components/ReportProblem/ScreenshotRedactor.tsx` is the Hide details editor.
  - `scrub.ts` holds the privacy rules, with tests in `src/__tests__/monitoring-scrub.test.ts`.
  - `MonitoringContextSync.tsx` keeps the tenant, role and route tags current.
  - Errors are captured from: both error boundaries, React Query query and mutation failures (`lib/query-client.ts`),
    and anything uncaught.
  - The demo build always has monitoring off.
- **Edge functions:** `supabase/functions/_shared/monitoring.ts`.
  - Every function is wrapped as `Deno.serve(withMonitoring("<name>", handler))`.
  - It reports unhandled throws (the caller gets a generic 500) and any 5xx response. 4xx responses are not reported.
  - In a `catch` block that returns a friendly error, call `reportEdgeError(err, "<name>", { tenant_id })` to keep
    the detail.
  - It doesn't use the Sentry SDK. It sends a plain HTTPS request, with a 2-second timeout, and never throws.
- **Release:** the git commit. deploy-web passes it as `VITE_RELEASE`; otherwise `GITHUB_SHA` or `git rev-parse`; see
  `apps/web/vite.config.ts`. Edge functions can set the `SENTRY_RELEASE` secret, but don't have to.
- **Source maps:** built "hidden", uploaded by `@sentry/vite-plugin`, then deleted from `dist`. This only happens
  when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` are all set on the build. If the upload fails, the
  build still succeeds.
- **GitHub issues:** `scripts/sentry-to-github.mjs` (tests: `apps/web/src/__tests__/sentry-to-github.test.ts`),
  run by `.github/workflows/sentry-issues.yml`. `DRY_RUN=1` prints instead of creating.
- **Trying it locally:** put a real DSN in `apps/web/.env.local` as `VITE_SENTRY_DSN` and set
  `VITE_SENTRY_ENVIRONMENT=development`, so production alerts stay clean.
