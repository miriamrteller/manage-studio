# Accountant view: documents, VAT and export

Owner request (2026-11-04): make the finance area useful for a studio's accountant.
This file is the one place for the tax facts and decisions behind it. Draft, not tax advice:
every tax statement below is marked [[ACCOUNTANT: confirm]] and listed in
[AWAITING-LAWYER-REVIEW.md](../../legal/AWAITING-LAWYER-REVIEW.md) (row 16).

## Rule: VAT follows the document issued, not business status

The owner's rule (see [PAYMENTS-AUDIT.md](../PAYMENTS-AUDIT.md), "Business status must
not change what our app does") stays: prices are gross, providers issue the documents, and
business status never switches app behaviour.

So the finance page and the export show VAT **from the document that was actually issued**
for each payment (`payments.issued_document_kind`):

| Document issued | Shown |
| --- | --- |
| Receipt (קבלה) | Gross; VAT 0 |
| Tax invoice-receipt (חשבונית מס-קבלה) | Pretax / VAT / gross, VAT included in the gross at the rate on the payment date |
| Credit document (חשבונית זיכוי) | Same split, negative |
| Unknown (the provider issued it and didn't say which) | Gross only, "document issued by <provider>" |
| No document | Gross only, with the reason (not paid, waiting, failed, can't be issued, studio issues no documents, refund made in YPay, missing) |

A studio that changes status mid-year needs nothing special: payments before the change keep
their receipts, payments after it carry their tax invoice-receipts.

Where the type comes from:
- **YPay**: the type YPay reports on the card callback, else the explicit setting "Which document
  does YPay issue?" (`tenants.ypay_document_type`, 108 receipt / 109 tax invoice-receipt), which is
  what we sent.
- **Green Invoice**: 320 tax invoice-receipt for a sale, 330 credit for a refund (fixed today).
- **Grow, iCount, Invoice4U**: their account decides and they don't tell us: unknown.
  (Owner decision 2026-11-04: gross only for these for now; Grow's future is open, revisit later.)

Existing documents are backfilled from the same settings
(migration `20261104092459_payments_issued_document_kind.sql`).

Code: `supabase/functions/_shared/payments/document-kind.ts` (provider codes),
`apps/web/src/features/finance-admin/lib/paymentDocuments.ts` (document status, VAT split).

## Tax facts [[ACCOUNTANT: confirm]]

- **VAT statuses** stay two: *osek patur* (עוסק פטור: charges no VAT, issues receipts) and
  *osek murshe* / company (עוסק מורשה / חברה: charges VAT, issues tax invoices or tax
  invoice-receipts). Osek patur turnover cap 2026 ≈ ₪122,833.
- **"Osek zair" (עסק זעיר, from 2026) is an income-tax track, not a VAT status.** Patur and
  murshe businesses with turnover up to the same cap can choose it for a flat 30% expense
  deduction without receipts. It changes nothing in VAT or in which document is issued, so the
  app needs no new VAT branch.
  Sources: [Bizportal](https://www.bizportal.co.il/guides/news/article/20045314),
  [Capitax, VAT](https://www.capitax.co.il/content/2/3399). Not yet checked on the Tax Authority's
  own site.
- **VAT rate**: 17% until 31.12.2024, 18% from 1.1.2025 (`israelVatRateOn`).
- **VAT reporting period**: every two months or monthly, depending on the business. The app
  doesn't guess: a studio setting, prefilled "every 2 months" (PR2).
- **Allocation numbers** (מספר הקצאה, "Israel invoice") matter for tax invoices to businesses;
  `payments.allocation_number` goes in the export.
- Our split is computed from the gross; the provider's document is the legal record and its
  rounding can differ by one agora.

## PRs

1. Record the document type per payment; "no document" reasons; VAT split helper.
2. Accountant export: no row cap (paged), period presets (month, VAT period, quarter, year),
   all columns, UTF-8 BOM; VAT period setting; expenses export cap removed too.
3. Payments log: document column (type, number, link or reason); refunds link to the original.
4. Charts and a VAT-period summary.
