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
| Prod schema | ✅ 32 migrations applied. Regenerating types from prod produced a **one-line** diff (`PostgrestVersion` only) — schema is identical to dev |
| Prod cron config | ✅ `supabase_functions_url` + `cron_secret` rows set; `pg_cron`/`pg_net` on; 9 jobs scheduled |
| Prod encryption key | ❌ **not set** — owner must insert it (see below) |
| Prod tenant | ❌ not provisioned — needs the owner `auth.users` row first |
| Edge Functions | ⚠️ deployed to prod, but **email credentials are not set**, so any send fails |
| Auth Send Email hook | ⚠️ **live** on prod, pointing at `send-auth-email`. Cannot be disabled, only deleted |
| Dev | `acmujrhavgbamdilzuew`, 32 migrations, seeded, 8 tenants |
| CI | green. `main` @ PR #37; PR #39 open and green |

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

---

## Known-open, deliberately

- **`WAIVER_LINK_SECRET` should be per-tenant.** A leak forges links for every
  tenant; the `tid` in the payload is no defence since a holder can mint any.
- **`send-otp-email` has no rate limiting.** `send-otp-sms` does. It is reachable
  with only the public key, so it is an open email-sending endpoint.
- **Five functions call `createClient` directly** instead of the shared
  `createServiceClient()` factory — the real rotation risk, not the var name.
- **Three functions still use gateway `verify_jwt`** (`send-otp-email`,
  `send-otp-sms`, `google-calendar-freebusy`). Only matters if moving Edge
  Functions onto `sb_secret_` keys.
- **No backups.** Free tier has no PITR and no daily backups. A `pg_dump` job was
  planned and not built. **Do this before real payment data lands.**
- **Twilio/WhatsApp** deferred; platform vs per-tenant undecided.

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
