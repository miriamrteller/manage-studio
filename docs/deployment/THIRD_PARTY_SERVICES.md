# Third-party services and finance environment

Environment variables required for the finance pipeline to run end-to-end on hosted dev.

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

## Email (Resend)

| Variable | Where | Purpose |
|----------|-------|---------|
| `RESEND_API_KEY` | edge function secret | Sends payment confirmation / receipt emails from `finalise-payment`. Without it, the email step is skipped and audited as `..._skipped`. |
| `NOTIFICATION_FROM_EMAIL` | edge function secret | Optional platform sender override. |

## Finance walkthrough (dev only)

`/admin/dev/finance-walkthrough` is gated to dev builds (`import.meta.env.DEV`) or
`VITE_ENABLE_FINANCE_WALKTHROUGH=true`. It needs the finance seed
(`pnpm seed:dev -- --finance`) on a tenant configured with `payment_provider=mock` and
`invoicing_provider=mock` so no live PSP / invoicing secrets are required.
