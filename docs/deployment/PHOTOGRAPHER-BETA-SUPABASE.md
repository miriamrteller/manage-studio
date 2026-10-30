# Photographer beta: Supabase setup brief

A task brief for the session that sets up the Supabase databases for the
photographer beta. It assumes the session can reach the owner's Supabase
account (connector, network secret or `SUPABASE_ACCESS_TOKEN`). If it can't,
say exactly what is missing and stop.

**Read first:** [GO-LIVE-PLAN.md](GO-LIVE-PLAN.md) and [HANDOVER.md](HANDOVER.md).
They hold the full ordering, the encryption-key trap and the bootstrap deadlock.
This brief only adds what the photographer work changed.

## Hard rules

- **Never** run `supabase db reset`, any `seed*.sql` or `scripts/reseed-dev.sh`
  against a hosted project. Dev holds the dance tenants' real test data.
- **Prod: ask the owner before every step that writes.** Report what will
  happen, wait for "yes", then do it.
- Never print secrets, keys or connection strings in messages, logs or PRs.
- Dev and prod are different projects. Before every command, confirm which ref
  you are pointed at (`supabase link` and `pnpm env:use` are separate switches).

## Projects

| | Ref | Region | Notes |
|---|---|---|---|
| Dev | `acmujrhavgbamdilzuew` | ap-northeast-2 | existing; mock payment flags on |
| Prod | owner's new project | eu-central-1 (Frankfurt) | must be on the Pro plan |

## What changed since the last deploy

The four migrations added since the dev database was last pushed:

- `20261030000100_job_details.sql`: shoots (`job_details`), `create_job`,
  `convert_lead_to_job`.
- `20261030000200_job_payment_requests.sql`: deposit and balance requests,
  gallery gating, `client_job_details` view, daily reminder cron.
- `20261030000300_quotes.sql`: quotes, `accept_quote`, automatic emails, a cron.
- `20261030000400_search_clients_by_whatsapp.sql`: client search also matches
  WhatsApp numbers, and a typed `054…` matches a stored `+972 54…`.
- `20261030000500_contract_signed_emails.sql`: allows the two signed-contract
  email keys in `automatic_email_log` / `tenant_automatic_emails`.

New or changed edge functions: `send-job-contract-link`,
`client-job-contract-link`, `job-contract-pdf-link` (signed-contract download),
`job-payment-request-public`, `record-job-payment`,
`run-job-payment-reminders`, `send-job-payment-link`, `accept-quote`,
`run-shoot-emails`, `handle-payment-event` (YPay callback path),
`accept-waiver` (now renders, stores and emails the signed contract PDF for
shoots), `get-waiver-engagement`, `send-notification`, plus the type
fixes from PRs #71 and #74. Deploy all functions, not a subset.

Signed contract PDFs go to the existing private `legal-documents` bucket under
`contracts/<tenant>/<engagement>/<evidence>.pdf`; no new bucket or secret.
The contract emails use the same transport as the other automatic emails
(`EMAIL_TRANSPORT`, `RESEND_API_KEY` or the Cloudflare pair) and
`PLATFORM_EMAIL_DOMAIN` / `APP_ROOT_DOMAIN` for the sender and fallback links.

## Part 1: dev

1. `supabase migration list` against dev. Confirm only the migrations above are
   pending. Anything else pending: stop and report.
2. `pnpm db:push` (dev), then `pnpm db:types:all` and `git diff`. The generated
   types should match the committed ones. If they differ, report the diff and
   stop.
3. Confirm the two new cron jobs exist in `cron.job`, and that `pg_cron` and
   `pg_net` are on.
4. Deploy every edge function to dev. Edge secrets stay on dev values: mock
   flags such as `YPAY_MOCK=true` stay on.
5. Create a photographer test tenant **without** running seeds. Use
   `provision_tenant(..., p_vertical := 'photographer', ...)`, then set
   `business_preset = 'services'` and add 2–3 packages
   (`offering_type = 'appointment'`, `season_id` NULL) plus a hidden
   "Custom shoot" package. If the owner prefers, ask before loading
   `seed-photographer.sql` on dev only.
6. Smoke test on dev: lead → convert to shoot → contract link → sign → quote →
   accept → deposit pay link (mock YPay) → paid → release gallery → client
   portal shows the gallery. Also sign in once as a dance parent and confirm
   that portal still shows children and enrolments.
7. `pnpm verify:rls` against dev.

Report results before starting Part 2.

## Part 2: prod (owner approves each step)

Follow GO-LIVE-PLAN.md Phase B and Phase C in order. Photographer-specific
points:

1. Region `eu-central-1` and the Pro plan are confirmed before anything else.
2. `supabase link` to prod, then `pnpm db:push`, then `pnpm db:types:all`. The
   types diff must be empty.
3. **Encryption key first.** Generate it with `openssl rand -base64 32`. The
   owner stores it in their password manager before you insert it into
   `private.platform_config`. Never reuse a dev key.
4. Cron config in `private.platform_config`: `supabase_functions_url` and
   `cron_secret`, matching the Edge `CRON_SECRET`.
5. Bootstrap the owner and the photographer's tenant with the trigger dance from
   GO-LIVE-PLAN.md. Use the subdomain the owner gives you. No seeds.
6. Edge secrets:
   - `APP_URL` set to the real tenant URL
   - `CRON_SECRET`
   - `EMAIL_TRANSPORT=cloudflare`, `CLOUDFLARE_ACCOUNT_ID`,
     `CLOUDFLARE_EMAIL_API_TOKEN`, `PLATFORM_EMAIL_DOMAIN=opalswift.com`,
     `NOTIFICATION_FROM_EMAIL`
   - **Unset every `*_MOCK` flag**, especially `YPAY_MOCK`. While it is on,
     anyone can forge a "paid" callback.
7. Deploy every edge function to prod.
8. `pnpm verify:prod`, `pnpm verify:rls` and `pnpm verify:env` must all pass.
9. Stop here. The photographer's YPay keys and the ₪1 live test happen with
   her at the meeting.

## Report

Send the coordinator, or the owner:

- what ran, against which ref
- the output of each verify script
- anything that failed or was skipped, and why
- any open question for the owner
