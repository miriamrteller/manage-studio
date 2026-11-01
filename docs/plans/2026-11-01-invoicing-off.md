# Invoicing off — 2026-11-01

Launch blocker 4b (docs/launch/LAUNCH-READINESS.md), PR 2 of the app thread.

## Problem

`tenants.invoicing_provider` defaults to `grow`. For a studio with no provider and no
credentials, every recorded payment (incl. cash via `record-payment`) enqueued a `sale`
document that retried, died and emailed the admin. Nothing illegal was issued, but it was
noisy and wrong, and there was no way to say "this studio issues no documents".

## Design

- **Slug `none`** in the invoicing registry = invoicing off. `getInvoicingProvider('none')`
  throws so no code path can issue a document by accident.
- **One choke point.** `enqueueDocument()` checks the tenant first and returns
  `{ queued: false, skipped: 'invoicing_off' }` with an audit row. `finalisePayment()`
  also branches before looking at the payment, so `record-payment → finalisePayment`
  never queues. Refunds (`process-refund`) and photographer manual payments
  (`record-job-payment`) go through the same helper.
- **No false alarms.** `check-missing-documents` skips payments of invoicing-off tenants
  (counted as `missingInvoicingOff`).
- **Admin toggle.** Admin → Setup → Settings → "Tax documents": checkbox "Issue tax
  documents automatically". Off stores `none` and shows the one-line note that a
  registered business must issue its own receipts. On stores the chosen provider; the
  credentials stay on the existing Invoicing provider page (hidden while off).
- **Default for offline tenants.** Migration `20261101000300` sets `none` where
  `payment_provider = 'none'` and no invoicing credentials exist; the go-live bootstrap
  SQL sets both slugs together. Existing tenants with a provider are untouched.

## Known limits

- A bundled provider (Grow) may still write a document via its own webhook even when the
  toggle is off, because the document is created on Grow's side. The toggle is meant for
  studios without a provider.
