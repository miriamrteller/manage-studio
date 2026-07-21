# Third-party services and finance environment

Environment variables required for the finance pipeline to run end-to-end on hosted dev.

## Where secrets live (do not commit)

| Layer | Store | Notes |
| --- | --- | --- |
| Local scripts / CLI | Repo-root `.env` (gitignored) | Template: [`.env.example`](../../.env.example) |
| Vite SPA | `apps/web/.env.local` + **Cloudflare Workers** build vars | Template: [`apps/web/.env.local.example`](../../apps/web/.env.local.example) |
| Edge Functions | Supabase → Edge secrets | `pnpm secrets:edge` / `secrets:email` / `secrets:google-calendar` |
| Cron auth | Edge `CRON_SECRET` **and** `private.platform_config.cron_secret` | Must match |
| Per-tenant Grow | Admin UI (DB encrypted) | Never put merchant `apiKey` in `.env` |

**Prod hygiene:** unset `GROW_MOCK`, `ICOUNT_MOCK`, `INVOICE4U_MOCK`, `GOOGLE_CALENDAR_MOCK`, `SYNC_ISSUE_DOCUMENT_IN_DEV`. Set `APP_URL` to the real SPA origin. Use a separate Supabase project for production.

## Document pipeline (issue-document worker)

The payment success path enqueues a `document_queue` row; a worker turns it into a tax
document. In dev you can run that worker in one of two ways:

| Variable | Where | Purpose |
|----------|-------|---------|
| `ISSUE_DOCUMENT_URL` | edge function secret | Full URL of the deployed `issue-document` function. When set, `enqueueDocument` fires it after enqueue. |
| `SYNC_ISSUE_DOCUMENT_IN_DEV` | edge function secret | When `true` (and `ISSUE_DOCUMENT_URL` unset), `enqueueDocument` calls `processQueueRow` inline — no HTTP self-call. Use for local/dev only. |
| `CRON_SECRET` | edge function secret | Shared secret the cron schedule and `enqueueDocument` send as `x-cron-secret` to `issue-document`. |

If neither `ISSUE_DOCUMENT_URL` nor `SYNC_ISSUE_DOCUMENT_IN_DEV` is set, `enqueueDocument`
logs a structured `document_queue_pending_no_worker` warning and the row waits for the
pg_cron batch (see `issue-document/index.ts` header for the cron schedule).

**Missing tax-doc watchdog:** Edge function `check-missing-documents` (pg_cron every 15 minutes,
migration `20260721000100_check_missing_documents_cron.sql`) emails tenant admins when a
succeeded payment still has no `external_document_id` after 30 minutes, and retries admin
invoice emails until `payment_document_admin_email_sent` is audited. Uses the same
`CRON_SECRET` / `x-cron-secret` pattern as `issue-document`.

## Email (Resend)

| Variable | Where | Purpose |
|----------|-------|---------|
| `RESEND_API_KEY` | edge function secret | Sends payment confirmation / receipt emails from `finalise-payment`, admin tax-invoice copies, and missing-document alerts. Without it, those email steps are skipped/failed and audited. |
| `NOTIFICATION_FROM_EMAIL` | edge function secret | Optional platform sender override. |

## Finance walkthrough (dev only)

`/admin/dev/finance-walkthrough` is gated to dev builds (`import.meta.env.DEV`) or
`VITE_ENABLE_FINANCE_WALKTHROUGH=true`. It needs the finance seed
(`pnpm seed:dev -- --finance`) on a tenant configured with `payment_provider=mock` and
`invoicing_provider=mock` so no live PSP / invoicing secrets are required.


## Scheduled jobs (pg_cron + Edge Functions)

| Variable | Where | Purpose |
|----------|-------|---------|
| `CRON_SECRET` | Edge function secret + DB GUC (`app.settings.cron_secret`) | Shared auth for scheduled HTTP calls (`x-cron-secret`). Must match in both places. |
| `app.settings.supabase_functions_url` | DB GUC | Base URL used by `net.http_post` in cron jobs (`https://<project-ref>.supabase.co`). |
| `APP_URL` | Edge function secret | Required for payment dunning email links, waiver/pay links, and Google Calendar OAuth `redirect_uri`. Set before enabling dunning cron or GCal connect. |

## Google Calendar (appointment scheduling)

| Variable | Where | Purpose |
|----------|-------|---------|
| `GOOGLE_CALENDAR_CLIENT_ID` | Edge function secret | OAuth client id |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Edge function secret | OAuth client secret; also HMAC key for signed OAuth `state` |
| `GOOGLE_CALENDAR_MOCK` | Edge function secret | When `true`, stubs free/busy and event insert/delete (dev only; unset in prod) |
| `APP_URL` | Edge function secret | Builds `{APP_URL}/admin/setup/integrations/google/callback` — must match Google Console Authorized redirect URI |

Sync from repo `.env`: `pnpm secrets:google-calendar`. See [scheduling/deployment-and-testing.md](../plans/scheduling/deployment-and-testing.md) and [scheduling/google-calendar-integration.md](../plans/scheduling/google-calendar-integration.md).

Pre-deploy SQL (manual):

```sql
ALTER DATABASE postgres SET app.settings.supabase_functions_url = 'https://<project-ref>.supabase.co';
ALTER DATABASE postgres SET app.settings.cron_secret = '<matches supabase secrets set CRON_SECRET>';
```
