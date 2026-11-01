# Marketing site (opalswift.com)

**Written:** 2026-11-01 · Workflows: `deploy-marketing.yml`, `marketing-ci.yml`

## What it is

`opalswift.com` (the apex domain, no subdomain) is the public marketing site:
plain static HTML in Hebrew (default) and English (toggle in the top bar),
with a home page, a "skins" page and one page per industry.

- Hosting: Cloudflare **Pages** project `opalswift`. It was first created by
  Direct Upload with no Git connection; since 2026-11-01 the source lives here.
- The product app is something else: the Worker `opalswift-app` on
  `app.opalswift.com` and the studio subdomains (`apps/web`, `deploy-web.yml`).

```
apps/marketing/
  public/      every file the site serves (HTML, topbar.js, images)
  functions/   Cloudflare Pages Functions (server code), e.g. /api/contact
  package.json only so wrangler is a pinned devDependency
```

The files in `public/` were copied unchanged from the live site on
2026-11-01. The site has no robots.txt, sitemap.xml, favicon.ico, `_headers`
or `_redirects` (unknown paths fall back to the home page). Fonts load from
Google Fonts.

## The contact form

The beta signup form on the home page (`#contact-form`) sends name, email
and message to **`/api/contact`** on the same site. That address is a
**Pages Function** inside the Cloudflare project, not a static file and not
the `lead-email-ingest` Worker (that Worker only receives lead emails).

**Its source code is not in git yet.** It could not be copied from the live
site. Until `apps/marketing/functions/api/contact.js` (or `.ts`) is added:

- `deploy-marketing` **refuses to deploy** (its first job fails with a
  clear message, before asking for approval). A Pages deploy replaces the
  whole site, functions included, so deploying without it would break the form.
- `marketing-ci` warns on every PR that the function is missing.

To unblock: either recover the original function source, or write a
replacement that sends signups to the same place and uses the same
variables/bindings (names: Cloudflare → Workers & Pages → opalswift →
Settings → Variables and Secrets / Bindings).

## How to edit

1. Branch from `main`, edit files in `apps/marketing/public/`.
   Every visible text has a Hebrew and an English version: the element's
   `data-he` and `data-en` attributes. Edit both (and the element's text,
   which is the Hebrew shown before the script runs).
2. Check links locally: `node scripts/ci/check-marketing-links.mjs apps/marketing/public`
   (errors = a link to a file that doesn't exist; warnings = an `#anchor`
   not on the page).
3. Open a PR. `marketing-ci` runs the same check.
4. Merge. Deploy starts automatically (below).

Add new pages and images under `public/`. Anything else in `apps/marketing`
outside `public/` and `functions/` fails `marketing-ci`.

## How it deploys

```
merge to main touching apps/marketing/**   (or Actions → deploy-marketing → Run workflow)
  └─ check: /api/contact function present? links OK?
       └─ deploy (environment "production") ── ⏸ OWNER APPROVES ──►
            wrangler pages deploy public --project-name=opalswift --branch=main
            → smoke: home page 200, release.txt == this commit, /api/contact answers
```

- wrangler comes from `apps/marketing/package.json` (`pnpm exec wrangler`),
  never `wrangler-action` and never `npm install`.
- The deploy writes `release.txt` (the commit id) into the upload; it is not
  committed. The smoke check reads `https://opalswift.com/release.txt`.
- `--branch=main` is the project's production branch. If the smoke check
  says release.txt is missing, check Pages → opalswift → Settings → Builds
  & deployments → Production branch; it must be `main`.
- Secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the
  `production` environment (the same ones deploy-web uses).

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
opalswift → Deployments** → on the last good deployment, **⋯ → Rollback to
this deployment**. That is instant and includes that deployment's functions.

Then fix forward in git (revert the PR) so the next deploy doesn't bring the
bad version back.

## Known issues on the live site (copied as-is)

- `designer.html`, `driving-instructor.html`: "Join the Beta" / "Pricing"
  links point to `#pricing`, which isn't on those pages, so they do nothing.
- `classes.html`, `photographer.html`: an SVG uses `url(#g1)`, a gradient not
  defined on that page.
