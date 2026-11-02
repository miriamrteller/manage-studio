# Marketing site (opalswift.com)

**Written:** 2026-11-01 · Workflows: `deploy-marketing.yml`, `marketing-ci.yml`

## What it is

`opalswift.com` (the apex domain, no subdomain) is the public marketing site:
plain static HTML in Hebrew (default) and English (toggle in the top bar),
with a home page, a "skins" page and one page per industry.

- Hosting: Cloudflare **Pages** project **`opalswift-il`** (`opalswift.com` is a
  CNAME to `opalswift-il.pages.dev`). It was first created by
  Direct Upload with no Git connection; since 2026-11-01 the source lives here.
- The product app is something else: the Worker `opalswift-app` on
  `app.opalswift.com` and the studio subdomains (`apps/web`, `deploy-web.yml`).

```
apps/marketing/
  public/      every file the site serves (HTML, topbar.js, images)
  functions/   Cloudflare Pages Functions (server code): api/contact.js
  test/        unit tests for the functions (never inside functions/)
  package.json wrangler as a pinned devDependency; `test` script
```

The files in `public/` were copied unchanged from the live site on
2026-11-01. The site has no robots.txt, sitemap.xml, favicon.ico, `_headers`
or `_redirects` (unknown paths fall back to the home page). Fonts load from
Google Fonts.

## The contact form

The beta signup form on the home page (`#contact-form`) sends `name`,
`email` and `message` as FormData to **`/api/contact`**, a Pages Function:
`apps/marketing/functions/api/contact.js`.

It emails each signup to **hello@opalswift.com** (Cloudflare Email Routing
forwards that to the owner's Gmail) through **Resend**, from
`no-reply@opalswift.com`, with Reply-To set to the person's email and the
subject `OpalSwift beta: <name>`. It stores nothing. It answers `{ok:true}`,
or `{ok:false,error}` with a 4xx/5xx status (the page only checks the status).

Checks: POST only (405 otherwise), FormData or urlencoded only, same-site
`Origin`, body ≤ 16 KB, all three fields required, name ≤ 100, email ≤ 254
(and email-shaped), message ≤ 4000 characters. If a hidden `website`,
`company` or `url` field is filled in (bots do this), it answers success and
sends nothing. The current form has no such field; adding one is optional.
There is no per-visitor rate limit (that would need storage). If spam shows
up, add a Cloudflare rate-limiting rule for `/api/contact`.

Logs never contain the API key or the submission, only status codes.

**Settings on the Pages project** (Cloudflare → Workers & Pages →
opalswift-il → Settings → Variables and Secrets, *Production*):

| Name | Type | Value |
|---|---|---|
| `RESEND_API_KEY` | Secret | a Resend API key, permission "Sending access", domain opalswift.com |
| `CONTACT_TO` | Text, optional | another recipient; default `hello@opalswift.com` |

`deploy-marketing` refuses to deploy if `RESEND_API_KEY` is missing.

History: until 2026-11-01 the live site ran a function whose source was
never in git, and the project had no variables, so where it sent signups is
unknown. This function replaces it.

Tests: `pnpm -C apps/marketing test` (Node's built-in runner, `fetch` mocked).
Test files live in `apps/marketing/test/`, never in `functions/` (every file
there becomes a public URL).

## Header and footer "Sign in" link

Every page links to the app (`https://app.opalswift.com`): "כניסה" / "Sign in"
in the header, next to the main button, and "כניסה לחשבון" / "Sign in to your
account" at the bottom of the footer. The beta button stays the main
call-to-action.

- Header: `index.html` has its own header; the other pages get theirs from
  `public/topbar.js` (one place for 19 pages).
- Footer: the line just before `</footer>` in every page (`.foot-signin`).

## "Create your studio" button

Next to the beta button in every page's hero (and in the home page's final
section): "פתחו סטודיו" / "Create your studio" →
`https://app.opalswift.com/create-studio`, the app's self-serve signup
(`SELF_SERVE_PATH` in apps/web). It uses each page's secondary button style;
the beta button stays the main one. Find them all with `data-create-studio`.
The app page only works while self-serve signup is switched on
(`VITE_ENABLE_SELF_SERVE_SIGNUP`); otherwise it redirects to sign-in.

## How to edit

1. Branch from `main`, edit files in `apps/marketing/public/`.
   Every visible text has a Hebrew and an English version: the element's
   `data-he` and `data-en` attributes. Edit both (and the element's text,
   which is the Hebrew shown before the script runs).
2. Check links locally: `node scripts/ci/check-marketing-links.mjs apps/marketing/public`
   (errors = a link to a file that doesn't exist; warnings = an `#anchor`
   not on the page).
3. Open a PR. `marketing-ci` runs the same check and the function tests.
4. Merge. Deploy starts automatically (below).

Add new pages and images under `public/`. Anything else in `apps/marketing`
outside `public/`, `functions/` and `test/` fails `marketing-ci`.

## How it deploys

```
merge to main touching apps/marketing/**   (or Actions → deploy-marketing → Run workflow)
  └─ check: /api/contact function present? links OK? function tests pass?
       └─ deploy (environment "production") ── ⏸ OWNER APPROVES ──►
            RESEND_API_KEY set on the Pages project?
            wrangler pages deploy public --project-name=opalswift-il --branch=<production branch>
            → smoke: home page 200, release.txt == this commit, /api/contact answers
```

- wrangler comes from `apps/marketing/package.json` (`pnpm exec wrangler`),
  never `wrangler-action` and never `npm install`.
- The deploy writes `release.txt` (the commit id) into the upload; it is not
  committed. The smoke check reads `https://opalswift.com/release.txt`.
- The deploy reads the project's production branch from the Cloudflare API
  and deploys to it (any other branch name would make a preview deployment
  that never reaches opalswift.com). The run summary shows which branch.
- Secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the
  `production` environment (the same ones deploy-web uses).

### Which Cloudflare account

The project name is set once, as `PAGES_PROJECT` at the top of
`deploy-marketing.yml`. The account is whatever `CLOUDFLARE_ACCOUNT_ID` in
the `production` environment says (the same account as `opalswift-app`).

If the deploy says **"Pages project opalswift-il not found in this
Cloudflare account"**, the project lives in a different Cloudflare account.
To find it: log in to Cloudflare, use the account switcher (top left), and
open Workers & Pages in each account until `opalswift-il` shows up. Then either:
- move the site into the main account: create a Pages project there
  (Direct Upload, any name), set `PAGES_PROJECT` to that name, deploy, then
  move the `opalswift.com` custom domain to it; or
- deploy to the other account: a token and account ID from that account,
  as separate secrets (this workflow would need a small change to use them).

### Cloudflare token permission

The token was made from the "Edit Cloudflare Workers" template, which does
**not** include Pages. Add, in Cloudflare → My Profile → API Tokens → (the
token) → Edit → Permissions:

> **Account · Cloudflare Pages · Edit**

Keep the existing permissions. The token value doesn't change, so the GitHub
secret stays as it is. Without this, the deploy step fails with an
authentication error (code 10000).

## How to roll back

Fastest (no Git needed): Cloudflare dashboard → **Workers & Pages →
opalswift-il → Deployments** → on the last good deployment, **⋯ → Rollback to
this deployment**. That is instant and includes that deployment's functions.

Then fix forward in git (revert the PR) so the next deploy doesn't bring the
bad version back.

## Known issues on the live site (copied as-is)

- `designer.html`, `driving-instructor.html`: "Join the Beta" / "Pricing"
  links point to `#pricing`, which isn't on those pages, so they do nothing.
- `classes.html`, `photographer.html`: an SVG uses `url(#g1)`, a gradient not
  defined on that page.
