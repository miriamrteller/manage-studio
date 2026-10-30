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

## Field mapping — confirmed against the YPay API document v2.1

Source: `https://ypay.co.il/assets/files/api/ypay_api_documentation.pdf`
(v2.1, 22-09-2026; the sandbox network allow-list was opened for it after the
first draft). What the adapter sends, quoted from the document:

- Endpoint: `POST https://<YPAY_base_api_URI>/document`, header
  `Authorization: Bearer access_token` — the same token as `/payment`.
- Request (p.6): `docType` (M), `mail` (O, "ships the document to the contact
  email"), `rounding` (O, "Whether to round the total amount. Default value is
  true" — we send `false`), `signDoc`, `details` ("Document description"),
  `lang` (he/en), `currency`, `contact` (M), `items` (M, `Item[]`), `methods`
  (M, "Array of 'Method' object").
- Method (p.18): `type` (M, "Reference 'Payment Methods'"), `total` (M, "Total
  payment amount"), `date` (O, "Date format is Y-m-d. Default is current date");
  cheque-only `bankId` / `bankBranch` / `bankAccount` / `transactionId`;
  card-only `cardType` / `payments`; app-only `app_type`.
- Payment Methods (p.20): **1 מזומן (cash) · 2 העברה בנקאית (bank transfer)** ·
  3 שיק · 4 אשראי · 5 פייפאל · 6 אפליקציית תשלום.
- Document Types (p.19): **108 קבלה · 109 חשבונית מס קבלה**; "docType = 0 (NONE)
  is not a valid value for Document Generator API".
- Item (p.17): "Item details attached to the document, except for document type
  =108"; `vatIncluded` "True – vat is included in the item price. Default value is
  true". Error 3022 = "Total items price not equal to total payment methods
  amount", so the single item and the method carry the same gross amount.
- Contact (p.16): `email` (M), `name` (M, max 255), `businessID` (O), `mobile` (O).
- Response (p.7): `{ "url": "https://ypay.co.il/fsrv/business/…/official/12ca76.pdf",
  "serial_number": "900061", "responseCode": 1 }` → stored as
  `external_document_id` = `external_document_number` = `serial_number`,
  `invoice_url` = `url`.

The v2.1 error table also corrected the v1.9 transcription in
`ypay/errors.ts`: bad credentials is **2001** (was 2003), "already an active
token" is **2002** (was 3001; the client accepts both), 3001 is now "document
type invalid", 3011/3012/3013 are payment-method errors, 3021/3022 item errors,
5001–5006 contact errors, 7001–7003 method errors.

## Dance tenants

`record-payment` (class enrolment, cash/bank) → `finalisePayment` →
`enqueueDocument` uses the same `document_queue` → `processQueueRow` path, so a
**dance tenant on YPay** gets offline receipts through this adapter too. Tenants
on Grow / iCount / Invoice4U / Green Invoice are untouched: their invoicing
adapters did not change.

## Tests

- `pnpm -C apps/web test ypay-offline-receipt` — docType rule, live `/document`
  payload + bearer token, 3011/3022 → dead, 503 → retry, 1004 → cache expired +
  retry, card/refund/no-email refusals, mock mode, queue idempotency (replayed
  row, pre-existing document), client email once, email wording he/en, and the
  card path's docType by VAT status.
- `deno test supabase/functions/_shared/payments/ypay/__tests__/document.test.ts`
  — pure payload / parser / retry-policy helpers.
