# Grow (Meshulam) Runbook

Operational guide for onboarding and verifying the Grow bundled payment + invoicing provider.
Grow captures the card payment and issues the Israeli tax document (חשבונית מס/קבלה) in one
flow, so for Israeli tenants `payment_provider = invoicing_provider = 'grow'`.

## 1. Sandbox setup

1. Create a Meshulam/Grow sandbox account and a payment page ("דף תשלום").
2. Collect values from the Grow dashboard and enter them in the app
   (Settings → Payments & invoices / bundled-payments — `save_tenant_grow_credentials`):

| Grow dashboard field | App / RPC param | Stored as |
| --- | --- | --- |
| User ID | `userId` / `p_user_id` | `tenants.payment_provider_account_id` |
| Page code (דף תשלום) | `pageCode` / `p_page_code` | `tenants.payment_provider_public_key` |
| API key | `apiKey` / `p_api_key` | `tenants.payment_provider_secret_enc` (encrypted) |

3. Press "Test connection" (`verify-grow-credentials` / FinanceHealthCard).
4. Save Grow webhook pre-shared key via `save_grow_webhook_secret` → `grow_webhook_secrets`
   (used by `constructEvent`; no dedicated settings field in UI yet).
5. Point Grow dashboard notify URLs at deployed Edge functions (see §4).

**Full pre-prod manual list (DB, email, WhatsApp, legal):** [SPEC.md §7](../../../SPEC.md#7-v1-production-deployment).

## 2. SHAAM / Israel Invoice connection

Grow issues tax documents on the merchant's behalf. The merchant must connect their Grow
account to the Israel Tax Authority allocation-number service ("חשבוniות ישראל" / SHAAM) inside
the Grow dashboard. This is a one-time per-tenant step done in Grow, not in this app. Until it is
connected, Grow may issue documents without an allocation number for amounts above the threshold.

## 3. Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `GROW_API_BASE` | payment provider | Defaults to the sandbox base `https://sandbox.meshulam.co.il/api/light/server/1.0`. Set to the production base for live. |
| `GROW_NOTIFY_URL` | `createCharge` | Public URL of the `handle-payment-event` function so Grow can post the payment notify. |
| `GROW_MOCK` | provider factory | `true` in CI/dev to use `MockGrowPaymentProvider` and never hit the live API. |
| `app.encryption_key` | DB | Postgres GUC used by `save_tenant_grow_credentials` to encrypt the API key. |
| `CRON_SECRET` | `run-monthly-billing` | Authorises the renewal cron. |

## 4. Webhook URLs

| Webhook | Endpoint | Notes |
| --- | --- | --- |
| Payment notify | `handle-payment-event` | Parses the Grow notify, calls Approve Transaction on success, finalises the payment. Routed per tenant via `cField1`. |
| Document notify | `handle-invoice-event` | Idempotently writes `external_document_id` / `invoice_url` onto the payment and settles the `document_queue`. |

Both functions resolve the tenant from the custom field `cField1` (= `tenant_id`), so a single
webhook URL serves all tenants.

## 5. Webhook ordering and bundled documents

Because Grow bundles the document with the charge, the document notify can arrive before or after
the payment finalises:

- If the document notify arrives first, `finalise-payment` sees `external_document_id` already set
  and skips `enqueueDocument` (no duplicate `document_queue` row).
- If finalise runs first, it enqueues a `sale` document; `handle-invoice-event` later settles that
  queue row to `succeeded` instead of issuing a second document.

## 6. pg_cron for `issue-document`

The generic document worker (`issue-document`) still runs for non-bundled providers and for the
refund documents. Schedule it via pg_cron (or the platform scheduler) using `CRON_SECRET`. For
Grow tenants this mostly settles refund documents, since sale documents come from Grow directly.

## 7. Verification checklist

- [ ] A new IL tenant provisions as `grow/grow` (see `provision_tenant`).
- [ ] Admin saves Grow credentials and "Test connection" returns connected.
- [ ] `GROW_MOCK=true` enrolment happy path passes (`/admin/dev/finance-walkthrough` + the mock
      payment form, or `pnpm -C apps/web exec playwright test --grep @finance-local`).
- [ ] Sandbox ₪1 charge on a test offering returns a `pageUrl` and the webhook finalises it.
- [ ] Refund of a same-day sandbox charge succeeds; a late/partial refund surfaces Grow's error in
      the refund modal.
