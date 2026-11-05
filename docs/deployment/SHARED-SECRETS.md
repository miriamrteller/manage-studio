# Shared secrets: one value, several places

**Rule:** a secret that lives in more than one place is never set by hand in
one place. Its pipeline rotation makes one new value, sets every copy in the
same run, and verifies them. Values are masked, never printed or stored. A copy
set by hand drifts from the others, and something then fails quietly (cron
jobs refused, auth emails not sent, leads not filed).

Checked 2026-11-03 against the workflows, `supabase/edge-secrets.json`, the
workers and the marketing site's functions.

## Rotated by the pipeline (we generate the value)

| Secret | Copies | Rotate with |
|---|---|---|
| `CRM_INGEST_SECRET` | Worker `lead-email-ingest` · prod Supabase Edge secret · marketing Pages project `opalswift-il` | Actions → **deploy-lead-email** → tick *rotate_ingest_secret*, then run **deploy-marketing** |
| `CRON_SECRET` (prod and dev, separate values) | Edge secret `CRON_SECRET` · DB row `private.platform_config.cron_secret` (read by every `pg_cron` job) | Actions → **rotate-secrets** → `CRON_SECRET` + project |
| `SEND_EMAIL_HOOK_SECRET` (prod and dev, separate values) | Edge secret (`send-auth-email`) · Auth → Hooks → Send Email secret | Actions → **rotate-secrets** → `SEND_EMAIL_HOOK_SECRET` + project |

Each run checks every copy by SHA-256 digest at the end and fails if one
differs. A run that fails halfway says which copy has the new value; re-run it.

`pnpm secrets:edge` / `pnpm secrets:email` never push these three from `.env`.

## Issued by a provider, copied into more than one GitHub environment

The pipeline cannot write GitHub secrets (the workflow token has no permission
to), so these are the exception for now. When one changes, the owner updates
**every** copy listed here in the same sitting, then runs a check
(deploy-prod with *dry_run*, and the nightly db-health).

| Secret | Copies |
|---|---|
| `SUPABASE_PROD_DB_URL` | GitHub environments `production` and `production-nightly` (and the old repo-level copy until it is removed) |
| `SUPABASE_ACCESS_TOKEN` | GitHub environments `production`, `development`, `production-nightly` |

## Kept separate on purpose (not shared)

| Secret | Rule |
|---|---|
| `RESEND_API_KEY` | prod Supabase and the marketing Pages project each get **their own** Resend key ("Sending access", opalswift.com). Don't paste one key into both. |

## One copy only (no shared-secret rotation needed)

- GitHub: `CLOUDFLARE_API_TOKEN` (`production`), `CLOUDFLARE_DEV_API_TOKEN` (`development`; its own token, used only by deploy-dev-web), `R2_*`, `FILES_BACKUP_*`, `SUPABASE_PROD_S3_*`, `SENTRY_AUTH_TOKEN`, `SUPABASE_DEV_DB_URL`, `SUPABASE_AUTH_SYNC_TOKEN` (`production-nightly`; its own Supabase token, used only by auth-redirects-sync).
- Supabase Edge secrets: `WAIVER_HMAC_KEY_V<n>`, `CLOUDFLARE_EMAIL_API_TOKEN`, `TURNSTILE_SECRET_KEY`, `TRANZILA_CALLBACK_SECRET`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `TWILIO_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `CLOUDFLARE_SAAS_API_TOKEN`, `GITHUB_DISPATCH_TOKEN` (fine-grained GitHub token, Actions: write on this repo only; custom-domain uses it to start auth-redirects-sync). The provider's own dashboard holds the original; we hold one copy.
- DB: `private.platform_config.encryption_key` (never in git or GitHub; [GO-LIVE-PLAN.md](GO-LIVE-PLAN.md)).

Not secrets (public by design), so not listed: `CLOUDFLARE_ACCOUNT_ID`,
`SENTRY_DSN`, publishable keys, `VITE_*`.

## Adding a new shared secret

Add its rotation to `rotate-secrets.yml` (or the workflow that deploys its
holder) in the same PR that adds the second copy, list it above, and add it
to `PIPELINE_ONLY` in `scripts/sync-edge-secrets.mjs` if it is an Edge secret.
