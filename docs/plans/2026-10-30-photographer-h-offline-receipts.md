# Photographer beta — Thread H: receipts for cash / bank-transfer payments (YPay)

Status: implemented on `photographer/h-offline-receipts`. Closes must-have 2 of
[lightblue-gap-analysis.md](lightblue-gap-analysis.md) ("Record offline payments" §5).

## Problem

When the photographer marks a deposit or balance as received in cash or by bank
transfer (`record-job-payment` / `ManualPaymentDialog`), Israeli law still
requires a tax document (קבלה, or חשבונית מס קבלה for a VAT-registered dealer)
from a certified system. Until now only YPay card charges got one (docType 109
bundled with `/payment`); the queued document for offline money failed
non-retryably and the admin had to issue it by hand in the YPay dashboard.

## Decision

Use YPay's standalone **Document Generator** (`POST {YPAY_API_BASE}/document`)
with the tenant's existing YPay credentials. One provider, one numbering series,
no extra setup for the photographer. Alternatives considered: a second Green
Invoice connection for offline documents (extra subscription, two document
series, schema change for a second provider column) and keeping the manual
workaround (does not meet the must-have).

The app never numbers a tax document: YPay returns id, number and URL and the
app stores them on `payments` like every other provider.

## Flow

1. `record-job-payment` inserts the `provider=manual`, `payment_method=cash|bank_transfer`
   payment and enqueues a `sale` row in `document_queue` (unchanged).
2. `issue-document` (`processQueueRow`) now:
   - skips the provider entirely when the payment already carries
     `external_document_id` (bundled callback landed first, or a replayed /
     duplicate queue row) — a legal document is never issued twice;
   - calls `YpayInvoicingProvider.issueDocument` → `POST /document`;
   - persists via `persistPaymentDocumentFields` (`external_document_id`,
     `external_document_number`, `invoice_url`, `invoice_issued_at`, PDF copy,
     `payment_document_recorded` audit) and emails the tenant admins as before;
   - emails the **client** the receipt link (`sendPaymentDocumentClientEmail`,
     audit `payment_document_client_email_sent|failed|skipped`). Only for
     `provider=manual` + offline method: card providers email their own documents.
3. `check-missing-documents` (cron, 15 min) retries the client email until
   `_sent` is audited, next to the existing admin-email retry.
4. Admin panel (`JobPaymentRequestRow`) shows "Receipt N" / "Receipt pending"
   for cash/bank rows and "Invoice N" for card rows; the client portal shows the
   "Receipt" link or "Receipt on its way"; Finance → Payments already lists the
   document number/link.

### docType by VAT status

`tenants.vat_type` 3 (exempt, עוסק פטור) → **108 receipt**; 1 / 2 → **109
invoice-receipt**. The same rule now applies to the bundled card charge in
`payments/providers/ypay.ts` (previously always 109). Default `vat_type` is 1,
so nothing changes for a tenant that never set it.

### Retry policy (`document_queue`)

| YPay outcome | Queue |
| --- | --- |
| network / timeout / HTTP 5xx, token 1001–1004 (cache expired first), 3001 token race | retry with backoff |
| 3011 bad docType, 3012 details missing, **3013 payment methods missing**, 5003 contact, 6001 items, 1101 currency, 2003 credentials, HTTP 4xx | dead + `document_queue_dead_alert` + missing-document admin alert |
| refund document (`document_kind=refund`) | dead: YPay has no credit-note API; issue in the dashboard (as before) |
| payer has no email | dead: YPay requires `contact.email`; add the email and requeue |

### Mock mode

`YPAY_MOCK=true` (already used by the card path) makes `issueDocument` return
`mock-ypay-doc-<paymentId>` / `YPAY-MOCK-<docType>-…` / `https://mock.ypay.local/document/…`
with no network. The browser demo (`apps/web/src/demo`) already settles manual
payments with a demo document; it now also drops the client receipt email in
the demo outbox.

## ⚠ Unverified field mapping — read before the first live offline receipt

The build sandbox could not open the YPay PDF (host blocked), so the
payment-method object inside the `/document` request follows the documented
structure ("array of Method objects", error 3013 when missing) but its exact
field names are a best effort. They live in one place:
`supabase/functions/_shared/payments/ypay/document.ts` → `METHOD_FIELD`,
`YPAY_METHOD_TYPE`, `buildYpayDocumentPayload`.

If YPay rejects the first live call the queue row goes **dead** (never a wrong
document) and admins are alerted. Then: open the PDF's "Common Objects → Method"
table, fix the constants, redeploy `issue-document`, and requeue the payment
(`POST issue-document {"payment_id": …, "document_kind": "sale"}` or re-run the
batch after setting the row back to `pending`).

Confirmed from the public documentation: endpoint path `/document`, same bearer
token as `/payment`, docType 108 = receipt / 109 = invoice-receipt (0 rejected),
`contact` (email + name mandatory), `items`, `lang`, `currency`, `mail`,
`signDoc`, `closeDoc`, free-text `description` not allowed on 108, and the
error codes above (already in `ypay/errors.ts`).

## Dance tenants

`record-payment` (class enrolment, cash/bank) → `finalisePayment` →
`enqueueDocument` uses the same `document_queue` → `processQueueRow` path, so a
**dance tenant on YPay** gets offline receipts through this adapter too. Tenants
on Grow / iCount / Invoice4U / Green Invoice are untouched: their invoicing
adapters did not change.

## Tests

- `pnpm -C apps/web test ypay-offline-receipt` — docType rule, live `/document`
  payload + bearer token, 3013 → dead, 503 → retry, 1004 → cache expired +
  retry, card/refund/no-email refusals, mock mode, queue idempotency (replayed
  row, pre-existing document), client email once, email wording he/en.
- `deno test supabase/functions/_shared/payments/ypay/__tests__/document.test.ts`
  — pure payload / parser / retry-policy helpers.
