# Photographer beta — Thread B: YPay deposit/balance + gated gallery link

Status: implemented on `photographer/b-payments` (part 1 + part 2). Beta tenant pays
through YPay (hosted page, bundled חשבונית מס קבלה docType 109, no tokenization,
no refund API).

## Data contract (shared with Threads A and C)

- A job (shoot) is an `engagements` row; Thread A owns `job_details`
  (`gallery_url`, `gallery_released_at`).
- `job_payment_requests` (this thread): one row per amount asked of the client
  (`label`, `amount_minor`, `currency`, `due_date`, `status`, `payment_id`,
  `max_installments`, `public_token`). Status machine:
  `pending → sent → paid → refunded_manual`, `pending|sent → cancelled → pending`.
  Enforced by a BEFORE UPDATE trigger and mirrored in
  `supabase/functions/_shared/jobs/payment-request-state.ts`.
- `payments.job_payment_request_id` (additive column): every charge created for a
  request. Several pending charges may point at one request; only one settles
  into `job_payment_requests.payment_id`.
- RPC `create_job_payment_requests(p_engagement_id, p_requests jsonb)` — Thread C
  calls it from an accepted quote; the admin panel uses the same RPC.
- RPC `get_client_job_gallery(p_engagement_id)` / `release_job_gallery(p_engagement_id, p_release)`.
  A RESTRICTIVE policy limits `job_details` SELECT to tenant admins, so a client
  can only ever see `gallery_url` through the RPC, and only once released.

## Money flow

1. Admin adds requests (quick "deposit X% + balance due on shoot date").
2. "Send pay link" emails the client (`send-job-payment-link`, payment-reminder
   template, he/en); WhatsApp uses a `wa.me` deep link with the same URL.
3. `/pay/:token` → `job-payment-request-public` → `createJobPaymentRequestCharge`
   → `YpayPaymentProvider.createCharge` (amount = `request.amount_minor`, gross;
   line item = request label; return URLs back to `/pay/:token?result=`).
4. YPay notifyUrl → `handle-payment-event` → `processYpayPaymentCallback`
   (dedicated pending-row path: verify with getTransactionsInfo, amount check,
   upgrade `provider_payment_ref` to the transactionId, settle, record the
   bundled document). Idempotent on replay; a second success for an already-paid
   request is recorded and flagged `job_payment_request.duplicate_payment`.
5. Manual: `record-job-payment` (cash/bank, human-approved, document queued) and
   `process-refund` with `manual: true` (no provider call; full refund →
   `refunded_manual`, credit note queued).
6. Reminders: `run-job-payment-reminders` daily (pg_cron) — link 3 days before
   `due_date`, one overdue reminder after; idempotent via stamp columns +
   `notification_log.dunning_key`.

## Tests

`pnpm -C apps/web test job-payment-request-state job-ypay-callback-idempotency job-payment-service`

## Follow-ups

- ~~YPay standalone `/document` issuance for offline (cash/bank) payments~~ —
  done in Thread H ([2026-10-30-photographer-h-offline-receipts.md](2026-10-30-photographer-h-offline-receipts.md)).
- Reminder lead time (3 days) is a constant; make it a tenant setting when a
  second photographer tenant needs a different one.
