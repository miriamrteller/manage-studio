# Credential ownership — what lives in `.env`, what lives in the database

**Verified:** 2026-08-06

One rule decides where a credential belongs:

> **Is it the platform's, or is it this tenant's?**
> Platform → environment. Tenant → database, encrypted.

A tenant credential in `.env` is not just untidy — it makes the value
single-tenant by construction. The second studio either shares the first
studio's account or cannot be onboarded at all.

---

## Platform — environment variables

These belong to OpalSwift and are shared by every tenant.

| Variable | Why it is platform-level |
|---|---|
| `APP_URL` | The tenant-less shell, and the Google OAuth `redirect_uri`, which must match the single URI registered with Google |
| `APP_ROOT_DOMAIN` | Root domain every tenant hangs off — tenant hosts are derived from it plus `tenants.subdomain` |
| `PLATFORM_EMAIL_DOMAIN` | Fallback sending domain for tenants with no verified branded domain |
| `NOTIFICATION_FROM_EMAIL` | Sender for non-tenant mail only |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_EMAIL_API_TOKEN` | One Cloudflare account sends for all tenants (Email Sending REST API) |
| `CRON_SECRET` | Shared secret between `pg_cron` and the Edge Functions |
| `WAIVER_HMAC_KEY_V<n>` | Tamper-evidence seal — see the note below |
| `GOOGLE_CALENDAR_CLIENT_ID` / `_SECRET` | OpalSwift's OAuth **application**. Tenants connect *through* it; their tokens are per-tenant and already in the database |
| `*_MOCK`, `*_API_BASE` | Deployment-wide behaviour, not tenant data |

---

## Tenant — database, encrypted

Written through the admin UI or an RPC, never through `.env`.

| Value | Column |
|---|---|
| Payment provider credentials | `tenants.payment_provider_secret_enc`, `payment_provider_public_key`, `payment_provider_account_id` |
| Invoicing credentials (Green Invoice, Yesh, iCount, Invoice4U) | `tenants.invoicing_api_key_enc`, `invoicing_secret_enc` |
| Provider webhook secrets | `tenants.payment_provider_webhook_enc`, `grow_webhook_secrets.secret_enc` |
| Google Calendar tokens | `tenants.google_calendar_refresh_token_enc`, `access_token_enc`, `google_calendar_id` |
| Sender identity | `tenants.contact_email`, `from_email`, `from_email_verified_at` |
| Tenant host | `tenants.subdomain` |

All `*_enc` columns are encrypted with the key in
`private.platform_config.encryption_key` and are **unreadable by clients** —
`002700_grants.sql` revokes the table-level `SELECT` on `tenants` and re-grants
per column, excluding everything matching `%_enc`. `pnpm verify:rls` asserts it.

---

## Two deliberate exceptions

**`WAIVER_HMAC_KEY_V<n>` stays out of the database.** It seals waiver evidence
records against tampering. A seal stored in the same place as the thing it
protects proves nothing — anyone who could alter a record could re-sign it. Its
value comes from living somewhere the database cannot reach.

**`WAIVER_LINK_SECRET` is per-tenant** (`tenants.waiver_link_secret_enc`). It
signs the token authorising a guest to sign or pay for one engagement — an
authorisation capability, so a platform-wide value would have made the blast
radius of a leak every tenant. Each tenant's secret is generated lazily by
`get_tenant_waiver_link_secret` (service_role only, never entered or seen by a
human) and the verifier reads `tid` from the unverified payload purely as a
lookup key — the standard key-id pattern — before verifying against that
tenant's secret. There is no env var.

---

## Deferred: per-tenant Twilio / WhatsApp

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` and
`TWILIO_VERIFY_SERVICE_SID` are read from platform environment in
`send-notification`, `send-otp-sms` and `verify-whatsapp-otp`. There are no
per-tenant columns.

That is a deliberate deferral, not an oversight — SPEC records Twilio
per-tenant decryption as postponed, and WhatsApp is blocked on Meta template
approval regardless. They have been **removed from `.env.prod`**: WhatsApp is
not launching, and leaving them there implies every studio would send from one
Twilio number.

**Before WhatsApp ships**, this needs deciding:

- One platform Twilio account sending on behalf of all studios — simpler,
  but every studio shares a sender identity and a rate limit, and one studio's
  spam complaints affect the rest.
- Per-tenant credentials in `tenants.twilio_*_enc` — matches how every other
  provider works here, and matches the pattern the email sender now uses
  (`contact_email` / `from_email`).

The second is consistent with the rest of the system. It needs a migration, an
admin UI surface, and the three functions above changed to read per tenant.
