# Handover — production go-live, Creative Ballet on opalswift.com

**Written:** 2026-08-06 · **Read first:** this, then
[GO-LIVE-PLAN.md](GO-LIVE-PLAN.md) and [CREDENTIAL-OWNERSHIP.md](CREDENTIAL-OWNERSHIP.md).

Do not trust any summary older than this file. Verify against the live project
rather than assuming, and say plainly when something is unverified.

---

## Where things actually are

**Production Supabase project exists and has the schema.**
`oogxajjanbyqhljxcmql`, region `eu-central-1` (Frankfurt), Free tier, in its own
`OpalSwift` organisation.

| | State |
|---|---|
| Prod schema | ✅ 32 migrations applied (chain folded; reset+replayed after PR #38). Regenerating types from prod produced a **one-line** diff (`PostgrestVersion` only) — schema is identical to dev |
| Prod cron config | ✅ `supabase_functions_url` + `cron_secret` rows set; `pg_cron`/`pg_net` on; 9 jobs scheduled |
| Prod encryption key | ❌ **not set** — owner must insert it (see below) |
| Prod tenant | ❌ not provisioned — needs the owner `auth.users` row first |
| Edge Functions | ⚠️ deployed to prod, but **Cloudflare Email credentials are not set**, so any send fails |
| Auth Send Email hook | ⚠️ **live** on prod, pointing at `send-auth-email`. Cannot be disabled, only deleted |
| Dev | `acmujrhavgbamdilzuew`, 32 migrations, seeded, 8 tenants, screenshot user test@example.com / 123456 (sign-in verified) |
| CI | green on `main` @ `1e3c907` (PR #39 merged 2026-08-06 15:05 UTC — Cloudflare email + env hardening + chain fold) |

**The repo is currently linked to PRODUCTION** and `.env` holds prod values.
`pnpm seed:dev` will refuse to run — that is the guard working.
Back to dev: `pnpm env:use dev` **and** `supabase link --project-ref acmujrhavgbamdilzuew`.
Those are two separate switches; changing one does not change the other.

---

## What the owner still has to do

1. **Encryption key** — in the prod SQL editor. No re-encrypt path exists, so
   losing it after credentials are saved makes them unreadable.
   ```sql
   INSERT INTO private.platform_config (key, value)
   VALUES ('encryption_key', '<32 random bytes, base64>')
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
   ```
2. **`CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_EMAIL_API_TOKEN`** into `.env.prod`
   (token: My Profile → API Tokens → Account → Email Sending → **Edit**).
3. **`npx wrangler email sending enable opalswift.com`** — onboards the sending
   domain and writes its DNS. Without it, every send returns
   *"Sender domain not verified"*.
4. **`INVOICE4U_API_BASE`** — production host, from Invoice4U.
5. **Owner account** — Dashboard → Authentication → Users → Add user.

Run `pnpm verify:env` to see what is still a placeholder.

---

## The bootstrap deadlock (will bite you)

`handle_new_user()` raises when `tenants` is empty; `provision_tenant` raises
when the owner has no `auth.users` row. On a fresh project both hold, so neither
can go first.

```sql
ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
-- create the owner via the dashboard, then:
SELECT provision_tenant('Creative Ballet Academy', 'creativeballet',
                        'professional', 'dance-studio',
                        '<owner email>', '<auth.users id>');
ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
```

Nothing is lost — `provision_tenant` upserts the owner as `tenant_admin`, which
is what they need anyway.

---

## Verification you can run

| Command | What it proves |
|---|---|
| `pnpm verify:env` | every var the code reads is declared; no secret in a `VITE_` var; `.env.dev`/`.env.prod` key sets match |
| `pnpm verify:prod` | encryption key set and not the dev value, cron config, extensions, no seed tenant |
| `pnpm verify:rls` | 37 checks — cross-tenant and cross-family isolation, `anon` denied, `*_enc` columns unreadable |
| `pnpm -C apps/web test` | 780 tests / 125 files |

`verify:rls` needs a seeded dev database; it will not pass against empty prod.

---

## Things that were wrong and are now fixed — do not reintroduce

- **Migrations seeded a production encryption key.** `get_app_encryption_key()`
  falls back to `private.platform_config`, and hosted Supabase forbids the GUC,
  so a committed key silently became production's. Migrations now seed none.
- **Six tenant-facing links were built from one platform `APP_URL`.** A second
  studio's parents would have received links to the first studio's site. Now
  derived from `tenants.subdomain` + `APP_ROOT_DOMAIN`. `APP_URL` is only the
  Google OAuth `redirect_uri` now, and a test enforces that.
- **Email sender precedence was inverted.** The platform address won over the
  tenant's, so following the deployment checklist would have made every tenant
  send as the platform. Now `resolveTenantSender()`: tenant identity wins,
  Reply-To is always the studio's inbox.
- **Two sender domains did not exist** (`manage-studio.app`,
  `creativeballet.co.il` — both NXDOMAIN).
- **Clients could read encrypted provider credentials.** Row access to `tenants`
  is broad by design, but a table-level `GRANT SELECT` handed over every column.
  `002700` now re-grants per column, excluding `%_enc`.
- **`WAIVER_HMAC_KEY_V1` was declared nowhere** yet `accept-waiver` throws
  without it — no parent could have signed a waiver on a fresh project. Its name
  is built dynamically, so no static check saw it.
- **The waiver evidence seal could not be verified.** `record_hmac` was written
  and never read back. `verify-waiver-evidence.ts` closes that.
- **The dev guard checked one switch and connected through the other.**
  `assertDevProject()` reads the ref from `.env`, but when the direct host is
  unreachable (it is — IPv6-only on Windows) `resolveConnectableDbUrl()` falls
  back to asking the **link** where to connect. With `.env` on dev and the link
  on prod, `pnpm seed:dev` passed its guard and opened a session on production;
  only a password mismatch stopped it seeding demo tenants and the public dev
  encryption key into the real database. `resolveDbUrlFromSupabaseCli()` now
  refuses when the linked ref and the `.env` ref disagree, and names both. This
  covers `seed:dev`, `verify:rls`, `verify:prod`, `smoke:cron:dev` and
  `apply-pending-migrations`, which all share that resolver.
- **`seed.sql` never set `font_pair`.** The orphan `seed_updates_font_pair.sql`
  from PR #38 was referenced nowhere, so branding was unexercised in dev.
  Creative Ballet now carries `font_pair` in its own `INSERT`; the two
  `provision_tenant` demo tenants get theirs beside the existing provider
  `UPDATE`s. The orphan file is deleted.

---

## Known-open, deliberately

- **`WAIVER_LINK_SECRET` is now per-tenant** (`tenants.waiver_link_secret_enc`,
  generated lazily by `get_tenant_waiver_link_secret`, service_role only; the
  verifier reads `tid` from the unverified payload as a lookup key). The env
  var is gone from `.env*` and the Edge secret sync. Outstanding links signed
  with the old platform secret no longer verify — pre-launch, none are real.
  NOTE: signing/verification now needs the DB encryption key, so on prod no
  waiver/pay link works until the owner inserts it — same gate as credentials.
- **`send-otp-email` has no rate limiting.** `send-otp-sms` does. It is reachable
  with only the public key, so it is an open email-sending endpoint.
- **Five functions call `createClient` directly** instead of the shared
  `createServiceClient()` factory — the real rotation risk, not the var name.
- **Gateway `verify_jwt` audit (2026-08-06, verified against both live projects).**
  Functions absent from `config.toml` deploy with the CLI default
  `verify_jwt = true`; nine were absent and all now have explicit entries.
  Findings: `send-waiver-reminder` is a cron target but pg_cron sends no
  Authorization header, so every invocation 401'd at the gateway
  (`UNAUTHORIZED_NO_AUTH_HEADER`, proven live) — it has never run in any
  environment; now `verify_jwt = false` (it validates `x-cron-secret`
  in-function). `handle-payment-document` now validates the tenant's Grow
  pre-shared key in-function (shared `verifyGrowWebhookKey`, also enforced
  on `handle-invoice-event`'s Grow branch, which was live with **no**
  webhook auth at all) and its gateway is open. Once a tenant stores a key,
  a notify without a matching `webhookKey` is rejected — omission is no
  longer a bypass, on the payment notify path too. Still locked and needing
  work before use: `twilio-webhook-status` (needs Twilio signature
  validation), `booking-expiry-sweep` (no in-function auth **and** never
  scheduled by any migration). `send-otp-email` /
  `send-otp-sms` / `google-calendar-freebusy` stay locked deliberately:
  the only `send-otp-email` caller (`WhatsAppOtpVerifier`) is never
  rendered, waiver OTP is V2, freebusy has no callers, and the signup
  SMS/WhatsApp channels were removed from the UI (their verify step invoked
  a `verify-otp` function that does not exist). Dev also carries six stale
  deployed functions that no longer exist in the repo (`stripe-webhook`,
  `rapyd-webhook`, `tranzila-payment-callback`, `create-payment-intent`,
  `create-payment-link`, `run-invoice-retry`).
- **No backups.** Free tier has no PITR and no daily backups. A `pg_dump` job was
  planned and not built. **Do this before real payment data lands.**
- **Twilio/WhatsApp** deferred; platform vs per-tenant undecided.
- **Cloudflare Email Sending needs the Workers Paid plan.** The account is on
  Free, where outbound sending is *not available* — every Email Sending endpoint
  returns `Unauthorized [2036]` even for a credential holding `email_sending
  (write)` on the right account. Email **Routing** is already configured on
  `opalswift.com` and is free on all plans; it is the inbound half and does not
  help. Upgrade, then `npx wrangler email sending enable opalswift.com`. Note
  that Email Sending is a **public beta** and PR #39 removed Resend, so the whole
  transactional path — auth emails, dunning, waivers, receipts — has no fallback.

---

## Traps specific to this repo

- **Pre-production migrations are edited in place**, never layered. A schema
  change means: `reset_dev_db.sql` → `db:push` → `db:types:all` → `seed:dev`.
  This stops once real tenant data exists.
- **Resetting dev does not fix Supabase preview branches.** They are separate
  databases. Renaming or deleting a migration breaks any pre-existing branch
  with *"Remote migration versions not found"*.
- **The final definition of a function is often not the first one.**
  `get_tenant_config_by_subdomain`, `provision_tenant` and
  `save_tenant_grow_credentials` are each declared and then replaced later.
  Grep and edit the highest-numbered occurrence.
- **An unset `*_MOCK` flag selects the LIVE adapter.**
- **`VITE_*` are inlined at build time** — changing one needs a rebuild, and
  Vite reads `apps/web/.env*` only, never the repo root.
- **Supabase injects its own Edge env vars** (`SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEYS`,
  `SUPABASE_SECRET_KEYS`, `SUPABASE_JWKS`). Do not try to override them.
- **Docker is not running**, so the CLI bundles server-side, which is more
  permissive than the branch-preview runner. A passing local deploy does not
  prove a preview will pass — open a PR and let Supabase Preview decide.

---

## Remaining phases

**C** — Edge secrets (`pnpm secrets:edge`, `pnpm secrets:email`) + redeploy.
Blocked on the Cloudflare values.
**D** — Cloudflare Workers: wildcard route `*.opalswift.com/*`, proxied wildcard
DNS, build vars, auth redirect URL. `apps/web/wrangler.jsonc` is written but
never deployed.
**E** — save provider credentials, Test connection green, one real end-to-end
charge, confirm the provider's notify URL points at `handle-payment-event`.
