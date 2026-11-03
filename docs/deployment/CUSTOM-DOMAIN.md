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

## How it works (code)

| Piece | What it does |
| --- | --- |
| `tenants.custom_domain` | Full hostname, lower-case (migration `20261101000800`). Unique. Only a super-admin, the service role or the SQL editor can change it. |
| `get_tenant_config_by_host(host)` | Public lookup the web app uses for hosts outside `VITE_APP_ROOT_DOMAIN`. Returns the same columns as `get_tenant_config_by_subdomain`. |
| Web app (`resolveTenantSite`) | Hosts under the root domain resolve by subdomain as before. Any other host is looked up by host. |
| Edge `tenantBaseUrl()` | Prefers `https://<custom_domain>` for every link in emails (pay, waiver, reminders, contracts, booking, unsubscribe). |
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
8. **Supabase Auth** → URL Configuration → Redirect URLs: add
   `https://app.creativeballetacademy.com/auth/callback`. Keep the opalswift URLs.
   The Site URL stays as it is.
9. **Check**: open `https://app.creativeballetacademy.com`. The studio's branding loads,
   sign-in by email link returns to the same host, and a test reminder email links to
   `app.creativeballetacademy.com`. The studio's own site at the apex is unchanged.

## Notes

- **Sessions are per origin.** A parent signed in on `creativeballet.opalswift.com` is not
  signed in on `app.creativeballetacademy.com`. Emails use the custom domain once it is
  set, so parents end up on one host.
- **Branded sender address** (`info@creativeballetacademy.com`) is separate: it uses
  `tenants.from_email` and its own DNS records (see GO-LIVE-PLAN.md).
- **Removing** a custom domain: set `custom_domain = NULL`. Links go back to
  `<subdomain>.opalswift.com` at once. Then remove the Worker route and the DNS records.

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
   *Zone · Zone · Read*; zone resources *Include · Specific zone ·
   opalswift.com*. Copy the token, and the **Zone ID** from the zone's Overview.
4. **Supabase prod Edge secrets** (Project → Edge Functions → Secrets):
   `CLOUDFLARE_SAAS_API_TOKEN`, `CLOUDFLARE_SAAS_ZONE_ID`, and
   `CUSTOM_DOMAIN_OWN_ZONES` = `creativeballetacademy.com` (domains that are
   zones in our own account; OpalSwift connects those by hand, path A).
   `CUSTOM_DOMAIN_CNAME_TARGET` is optional: leave it unset, it defaults to
   `proxy-fallback.opalswift.com` (set it only if the fallback record has
   another name).
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
