# Custom domain for a studio

How a studio's own hostname, such as `app.creativeballetacademy.com`, serves its OpalSwift
app. The studio's existing website stays where it is.

**Ground rules**
- Only a **subdomain** of the studio's domain is used (default `app.`). The apex
  (`creativeballetacademy.com`) and `www` keep pointing at the studio's own website and
  are never routed to the OpalSwift Worker.
- None of the studio's existing DNS records are changed.
- `<subdomain>.opalswift.com` keeps working. Emails and links switch to the custom domain
  once it is set on the tenant.

## Two ways to connect

- **Self-serve (usual):** the studio admin connects the address in **Settings → Your own
  web address**. Cloudflare for SaaS checks the DNS records and issues the certificate;
  nobody at OpalSwift does anything. Owner setup (once): see the last section.
- **By OpalSwift (path A):** when the studio's domain is a zone in our own Cloudflare
  account (listed in `CUSTOM_DOMAIN_OWN_ZONES`, e.g. `creativeballetacademy.com`). The
  screen says "We'll connect this for you"; follow *Setup checklist → A* below.

## Self-serve: what happens

1. The admin types the address (prefilled `app.<their domain>`) and presses **Connect**.
   The `custom-domain` Edge Function checks it (`_shared/custom-domain/hostname.ts`:
   a subdomain only, no www, no reserved names, not ours, not used by another studio or
   released by one in the last 30 days), creates the Cloudflare custom hostname and
   stores a row in `tenant_custom_domains`.
2. The screen shows three records to add at the studio's DNS provider: a **CNAME** to
   `proxy-fallback.opalswift.com`, a **TXT** that proves the domain is theirs, and a
   **TXT** for the certificate. Their apex, `www` and email records stay as they are.
3. The poller (pg_cron, every 10 minutes, only while something is pending) checks it
   for **24 hours**. Then the domain is **paused**; **Check now** checks at once and
   opens a new 24-hour window. While paused the Cloudflare hostname is kept.
4. When Cloudflare reports the hostname and certificate **active**, the address is first
   added to the Turnstile widget (the sign-in bot check), so sign-in works from the first
   visit. Then `tenants.custom_domain` is set (links and emails switch),
   `auth-redirects-sync` adds `https://<domain>/**` to Supabase's redirect URLs, and the
   screen shows **Connected ✓**. If the widget is full (10 hostnames on the free plan;
   `opalswift.com` and `creativeballetacademy.com` use two), the domain waits as
   `turnstile_full`. The studio sees "nothing more for you to do", the owner gets one
   Sentry alert, and the domain goes live on the next check after a slot is freed.
5. Never connected after **30 days**: the Cloudflare hostname is deleted and the
   studio can start again.

**Removing:** the admin types the address to confirm. Cloudflare first, then
`tenants.custom_domain` is cleared (links go back to `<subdomain>.opalswift.com` at
once), then the redirect URL and the Turnstile hostname are removed. The address stays locked to that studio for
30 days, so nobody else can take it while its CNAME may still point at us.

**Rollout:** only studios in `custom_domain_rollout` see the screen (a prod task adds
one; `supabase/prod-tasks/*_custom_domain_rollout_first_studio.sql`).

## How it works (code)

| Piece | What it does |
| --- | --- |
| `tenants.custom_domain` | Full hostname, lower-case (migration `20261101000800`). Unique. Only a super-admin, the service role or the SQL editor can change it. Self-serve sets it when the domain becomes active. |
| `tenant_custom_domains` | Self-serve state per studio: status, records to show, 24-hour window, 30-day dates (migration `20261103120000`). Written only by `custom-domain`; studio admins read their own. Every status change is in `audit_log`. |
| `custom-domain` Edge Function | status / request / check / remove for the studio's admin; poll for pg_cron (`20261103124800`). Rules and tests: `_shared/custom-domain/`. |
| `_shared/custom-domain/turnstile.ts` | Adds a domain to the Turnstile widget's hostname list before it goes live, and takes it off on removal (Cloudflare API, `TURNSTILE_SITE_KEY`, `CLOUDFLARE_ACCOUNT_ID`). An exact hostname only; a listed parent domain doesn't count. "Check now" on a live domain re-adds it if it went missing. |
| `auth-redirects-sync` workflow | Keeps Supabase Auth's redirect URLs in step with active custom domains (nightly, and started on every activation or removal). |
| `get_tenant_config_by_host(host)` | Public lookup the web app uses for hosts outside `VITE_APP_ROOT_DOMAIN`. Returns the same columns as `get_tenant_config_by_subdomain`. |
| Web app (`resolveTenantSite`) | Hosts under the root domain resolve by subdomain as before. Any other host is looked up by host. |
| Edge `tenantBaseUrl()` | Prefers `https://<custom_domain>` for every link in emails (pay, waiver, reminders, contracts, booking, unsubscribe). |
| Studio icon in the page (`apps/web/worker`) | The `opalswift-app` Worker puts the studio's logo into the HTML's icon links and the tab title, and answers `/favicon.ico` and `/apple-touch-icon.png` with it, for any studio host (subdomain or custom domain). Safari, iOS and home-screen icons read these instead of the app's script. A changed logo shows within 5 minutes. It uses the same public lookup as the app (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_ROOT_DOMAIN`, passed by the deploy step). If the lookup fails or the studio has no logo, the visitor gets the OpalSwift icons and the app's script still swaps the icon. |
| Sign-in | Login links return to the origin the parent used (`window.location.origin`). That origin must be on the Supabase redirect allowlist. |

## Setup checklist

**Primary path: A.** Use it when the studio's domain is listed under **Websites** in the
same Cloudflare account as the `opalswift-app` Worker. The owner believes this is true for
`creativeballetacademy.com`, but has not confirmed it yet. Otherwise use **B**.

> **Worker routes live only in `apps/web/wrangler.jsonc`.** The `deploy-web` workflow runs
> `wrangler deploy`, which replaces the Worker's routes with the ones in that file. A route
> added only in the dashboard disappears on the next web release. A route for a zone the
> account does not have makes the deploy fail. So add the route line in a small PR, after the
> zone is confirmed and the DNS record below exists, and let `deploy-web` apply it.

### A. The studio's domain is a Cloudflare zone in the OpalSwift account

1. **DNS** (zone `creativeballetacademy.com`): add one record and leave the others alone.

   | Type | Name | Content | Proxy |
   | --- | --- | --- | --- |
   | `AAAA` | `app` | `100::` | Proxied |

   `100::` is a placeholder: the Worker answers, so there is no origin server.
2. **Worker route**: once step 1 is done, add this to the `routes` list in
   `apps/web/wrangler.jsonc` in a PR. `deploy-web` applies it after merge (owner approval).
   ```jsonc
   { "pattern": "app.creativeballetacademy.com/*", "zone_name": "creativeballetacademy.com" }
   ```
   Do not add a route for the apex or `www`.
3. **TLS**: Universal SSL already covers first-level subdomains of an active zone. Nothing to do.
4. Continue with **Both paths** below.

### B. The studio's DNS is somewhere else (registrar, other host, or another Cloudflare account)

Recommended: **Cloudflare for SaaS** on the `opalswift.com` zone. The studio adds one CNAME
at its current DNS provider and nothing else of theirs moves.

Once, on the `opalswift.com` zone:
1. Enable **Cloudflare for SaaS** (SSL/TLS → Custom Hostnames). Check the
   [plans page](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/)
   for how many custom hostnames the current plan includes.
2. Add a fallback origin record and set it as the **Fallback Origin**:

   | Type | Name | Content | Proxy |
   | --- | --- | --- | --- |
   | `AAAA` | `proxy-fallback` | `100::` | Proxied |

For each studio:
3. Custom Hostnames → **Add custom hostname**: `app.creativeballetacademy.com`.
4. **Worker route** on the `opalswift.com` zone, added to `apps/web/wrangler.jsonc` in a PR
   (applied by `deploy-web`):
   ```jsonc
   { "pattern": "app.creativeballetacademy.com/*", "zone_name": "opalswift.com" }
   ```
   Use the exact hostname, never `*/*`, so the `opalswift.com` apex stays out of the app.
5. The studio adds these records at its own DNS provider. Their apex and `www` records stay untouched.

   | Type | Name | Content |
   | --- | --- | --- |
   | `CNAME` | `app` | `proxy-fallback.opalswift.com` |
   | `TXT` | as shown by Cloudflare | certificate / hostname validation value shown on the custom hostname |

6. Wait until the custom hostname and its certificate show **Active**.

Not recommended: moving the studio's whole DNS to Cloudflare to use path A. It risks the
studio's website and email records (MX, SPF, DKIM) for no gain.

### Both paths

7. **Tenant row** (data, SQL editor on prod; show the owner first):
   ```sql
   UPDATE tenants SET custom_domain = 'app.creativeballetacademy.com'
   WHERE subdomain = 'creativeballet';
   ```
8. **Supabase Auth redirect URL**: nothing to do once `auth-redirects-sync` is set up
   (it adds `https://<domain>/**` for every active custom domain). Before that, add it
   by hand under Supabase Auth → URL Configuration → Redirect URLs.
9. **Turnstile hostname** (the bot check on sign-in, sign-up and enquiry forms). In
   Cloudflare, open **Turnstile**, then the OpalSwift widget, then **Settings**. Under
   **Hostname Management**, add `app.creativeballetacademy.com` and save.
   Without it, the widget shows "Unable to connect to website" (error 110200) on the
   custom domain and nobody can sign in there. The free plan allows 10 hostnames per widget,
   and `opalswift.com` already uses one of them.
10. **Check**: open `https://app.creativeballetacademy.com`. The studio's branding loads,
   the sign-in bot check shows no error, sign-in by email link returns to the same host,
   and a test reminder email links to `app.creativeballetacademy.com`. The studio's own
   site at the apex is unchanged.

## Notes

- **Sessions are per origin.** A parent signed in on `creativeballet.opalswift.com` is not
  signed in on `app.creativeballetacademy.com`. Emails use the custom domain once it is
  set, so parents end up on one host.
- **Branded sender address** (`info@creativeballetacademy.com`) is separate: it uses
  `tenants.from_email` and its own DNS records (see GO-LIVE-PLAN.md).
- **Removing** a self-serve domain: the studio does it in Settings (above). A path-A
  domain: set `custom_domain = NULL` with a prod task; links go back to
  `<subdomain>.opalswift.com` at once and `auth-redirects-sync` drops its redirect URL.
  Then remove the Worker route, the DNS records and the Turnstile hostname (step 9).

## Self-serve custom domains: owner setup (once)

Studios connect their own address from **Settings → Your own web address**
(Cloudflare for SaaS). Do these once, in this order. Steps 1–2 must be done
before the `*/*` route in `apps/web/wrangler.jsonc` is released.

1. **Keep the marketing site out of the app** (Cloudflare → `opalswift.com` →
   Workers Routes → *Add route*): route `opalswift.com/*`, Worker **None**.
   `www.opalswift.com` already goes to the app's `*.opalswift.com/*` route, as
   today; nothing changes for it.
2. **Cloudflare for SaaS** (Cloudflare → `opalswift.com`):
   - DNS → *Add record*: `AAAA`, name `proxy-fallback`, IPv6 `100::`, **Proxied**.
   - SSL/TLS → Custom Hostnames → enable Cloudflare for SaaS, then set
     **Fallback Origin** to `proxy-fallback.opalswift.com`. Wait for *Active*.
3. **Cloudflare API token** (My Profile → API Tokens → *Create Token* →
   *Custom token*): permissions *Zone · SSL and Certificates · Edit* and
   *Zone · Zone · Read*, and *Account · Turnstile · Edit*; zone resources
   *Include · Specific zone · opalswift.com*, account resources *Include · the
   OpalSwift account*. Copy the token, and the **Zone ID** from the zone's
   Overview.
4. **Supabase prod Edge secrets** (Project → Edge Functions → Secrets):
   `CLOUDFLARE_SAAS_API_TOKEN`, `CLOUDFLARE_SAAS_ZONE_ID`, and
   `CUSTOM_DOMAIN_OWN_ZONES` = `creativeballetacademy.com` (domains that are
   zones in our own account; OpalSwift connects those by hand, path A).
   `CUSTOM_DOMAIN_CNAME_TARGET` is optional: leave it unset, it defaults to
   `proxy-fallback.opalswift.com` (set it only if the fallback record has
   another name).
   Also `TURNSTILE_SITE_KEY`: the same value as the web app's
   `VITE_TURNSTILE_SITE_KEY` (public). It needs `CLOUDFLARE_ACCOUNT_ID`, which
   email already uses, so it is usually set; if not, it is on any domain's
   Overview page. Without the site key, domains go live without touching the
   widget (only right if the app has no bot check).
5. **Redirect allowlist sync**: `SUPABASE_AUTH_SYNC_TOKEN` (GitHub environment
   `production-nightly`) and `GITHUB_DISPATCH_TOKEN` (Supabase prod Edge secret);
   steps in PR #279's description. Then run *auth-redirects-sync* with *dry_run*.
6. **Run a release** (Actions → deploy-prod; one approval covers the web app) and
   check: `https://opalswift.com` still shows the marketing site,
   `https://app.opalswift.com` the app, `https://app.creativeballetacademy.com`
   Creative Ballet.
7. **Turn it on for one studio** with a prod task (no hand SQL;
   [PROD-TASKS.md](PROD-TASKS.md)): in
   `supabase/prod-tasks/*_custom_domain_rollout_first_studio.sql`, replace the
   placeholder with the test studio's subdomain in a small PR, merge, then
   Actions → prod-task → that file (dry run first). Its admin then sees
   *Your own web address* in Settings.

Until steps 2–4 are done the screen answers "Custom addresses aren't available
yet" and nothing is created. Removing a studio from `custom_domain_rollout`
hides the screen; domains already connected keep working.

## Troubleshooting (self-serve)

The screen explains each case in plain words; this is what is behind it.

| The studio sees | Usually | Fix |
| --- | --- | --- |
| "We can't see your records yet" | DNS not saved or still spreading (minutes to hours) | Wait, then **Check now** |
| "This address points somewhere else" | CNAME missing, wrong target, or an old A record for the same name | One CNAME to `proxy-fallback.opalswift.com`, nothing else for that name |
| "We can't see the ownership record" | The `_cf-custom-hostname…` TXT missing or mistyped | Copy it again with the Copy button |
| "A CAA record … blocks our certificate" | The domain allows only some certificate authorities | Allow `letsencrypt.org` and `pki.goog`, or remove the CAA record |
| Paused | 24 hours without success | Fix the records, then **Check now** |
| Domain on Cloudflare (orange cloud) and never connects | The studio's CNAME is proxied | Set it to **DNS only** (grey cloud) |
| "Already used by another studio" | Live elsewhere, or released by another studio under 30 days ago | Wait out the 30 days or contact us |
| "Custom addresses aren't available yet" | Cloudflare secrets not set on prod | Owner setup, steps 3–4 |
| "Your address is ready … nothing more for you to do" (`turnstile_full`) | The Turnstile widget's hostname list is full (Sentry alert: "Turnstile widget is full") | Free a slot (Turnstile → widget → Hostname Management: remove an unused hostname), or set `TURNSTILE_HOSTNAME_LIMIT` after an upgrade. The next check puts it live |
| Sign-in on the new address says "Unable to connect to website" | The hostname is missing from the Turnstile widget (path A, or removed by hand) | Path A: step 9. Self-serve: the studio presses **Check now** |

What happened and when: `tenant_custom_domains` (`status`, `error_code`,
`last_checked_at`) and `audit_log` rows with `action LIKE 'custom_domain.%'`.
