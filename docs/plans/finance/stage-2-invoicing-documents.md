# Stage 2 — Invoicing Provider Abstraction + Document Issuance + Retry Queue

> **Depends on:** Stage 1 (`invoicing_token_cache`, `document_queue`, invoicing RPCs,
> `payments.external_document_*`; no `invoice_sequences`).
> **Independent of payment capture** — testable with `MockInvoicingProvider` in CI and
> `GreenInvoiceProvider` against the GI sandbox.

## Objective

Stand up **Flow F** with the same adapter pattern as payment capture (Stage 3):

```
enqueueDocument → document_queue → issue-document worker → InvoicingProvider adapter
```

Queue rows store **only** `payment_id` + `document_kind`. The worker always builds
`CanonicalDocumentInput` from live DB rows — no snapshot JSONB (single source of truth).

## Invoice numbering (locked)

- **Legal document number:** `payments.external_document_number` (from invoicing provider).
- **No** `next_invoice_number()` / `invoice_sequences` / `payments.invoice_number`.
- Stages 4–7 must not allocate internal invoice numbers at payment time.

## Architecture

```
_shared/invoicing/
  types.ts
  registry.ts                 -- INVOICING_PROVIDER_SLUGS + Zod
  index.ts                    -- getInvoicingProvider(tenant)
  build-canonical-input.ts    -- payments + people + billing_accounts + tenants → input
  refresh-token.ts
  providers/
    mock.ts
    green-invoice.ts
```

### `InvoicingProvider` interface (`types.ts`)

```ts
export type DocumentKind = 'sale' | 'refund';

export interface CanonicalDocumentInput {
  tenantId: string;
  paymentId: string;
  documentKind: DocumentKind;
  language: 'he' | 'en';
  currency: string;
  pretaxAmountMinor: number;
  vatAmountMinor: number;
  totalAmountMinor: number;
  vatRate: number;
  payer: { name: string; email?: string };
  buyer?: { businessTaxId?: string; businessName?: string };
  originalExternalDocumentId?: string;
}

export interface ExternalDocumentResult {
  externalDocumentId: string;
  externalDocumentNumber: string;
  documentUrl: string;
}

export interface AuthHealthResult {
  valid: boolean;
  validUntil?: string;
  message?: string;
}

export interface InvoicingProvider {
  readonly slug: string;
  authenticate(service: SupabaseClient, tenantId: string): Promise<void>;
  issueDocument(service: SupabaseClient, input: CanonicalDocumentInput): Promise<ExternalDocumentResult>;
  checkAuthHealth?(service: SupabaseClient, tenantId: string): Promise<AuthHealthResult>;
}
```

Vendor-specific GI types (`receipt`, `tax_invoice`, `credit_note`) are chosen **inside**
`GreenInvoiceProvider` from `documentKind` + tenant VAT settings.

### `GreenInvoiceProvider` (`providers/green-invoice.ts`)

- Token cache via `refreshInvoicingToken()`.
- Auth: `get_tenant_invoicing_credentials` → `POST {base}/account/token`.
- Issue: `POST {base}/documents`.
- Env: `GREEN_INVOICE_API_BASE` (deploy config only).
- Zod + `InvoicingProviderError { retryable: boolean }`.
- `checkAuthHealth()` — SHAAM/auth (Israel-only logic in this file).

### `MockInvoicingProvider` (`providers/mock.ts`)

Deterministic fake IDs/URLs; zero HTTP.

### `getInvoicingProvider(tenant)` (`index.ts`)

Exhaustive switch on `tenant.invoicing_provider` against registry.

## Files to create

### `_shared/invoicing/build-canonical-input.ts`

`buildCanonicalDocumentInput(service, { paymentId, documentKind })`:
- Load `payments` (+ original payment for refunds via `refunds_payment_id`).
- Load payer from `people`; buyer fields from `billing_accounts` via `payments.billing_account_id`
  or `engagements.billing_account_id`.
- Load `tenants.language_default`, VAT context.
- Return `CanonicalDocumentInput`.

### `_shared/enqueue-document.ts`

```ts
enqueueDocument(service, { tenantId, paymentId, documentKind })
```
- Insert `document_queue` row (`pending`). **No payload column.**
- Rely on unique index `idx_document_queue_one_active` for idempotency — catch conflict and
  no-op if an active row already exists for `(payment_id, document_kind)`.
- Optionally invoke `issue-document` fire-and-forget (cron is the guarantee).

### `supabase/functions/issue-document/index.ts`

Service-role / `CRON_SECRET`-guarded. Never from browser.

Input: `{ queue_id }` OR `{ payment_id, document_kind }` OR `{ mode: 'batch' }`.

Logic:
0. **Stale processing sweep** (batch mode first step): reset rows where
   `status = 'processing'` AND `processing_started_at < now() - interval '15 minutes'`
   → `status = 'pending'`, `processing_started_at = NULL` (worker crash recovery).
1. Load queue row(s).
2. `status = 'processing'`, `processing_started_at = now()`.
3. `input = buildCanonicalDocumentInput(...)`.
4. `getInvoicingProvider(tenant).issueDocument(service, input)`.
5. **Success:** update `payments` (`external_document_id`, `external_document_number`,
   `invoice_url`, `invoice_issued_at`); queue → `succeeded`, `succeeded_at=now()`.
6. **Retryable failure:** backoff; `attempts >= 5` → `dead` (Stage 9 alert).
7. **Fatal 4xx:** `dead` immediately.

`backoff(n)` = `min(2^n, 60)` minutes. Batch: up to 20 due `pending` rows.

### `supabase/functions/verify-invoicing-credentials/index.ts`

Admin-only. `authenticate()` + success/failure JSON. Stage 8 "Test connection".

## pg_cron

```sql
SELECT cron.schedule(
  'document-queue-retry',
  '*/15 * * * *',
  $$ SELECT net.http_post(
       url := <issue-document-url>,
       headers := jsonb_build_object('x-cron-secret', <CRON_SECRET>),
       body := '{"mode":"batch"}'::jsonb
     ); $$
);
```

## Definition of Done

- [ ] Mock: enqueue → worker → `external_document_*` set; zero HTTP.
- [ ] GI sandbox: real sale + refund credit note documents.
- [ ] Duplicate enqueue for same payment/kind → no second active row.
- [ ] Token cache hit avoids redundant auth call.
- [ ] Retry backoff + dead-letter; fatal 4xx → immediate dead.
- [ ] Zod on all external API payloads.
- [ ] Unit tests: `buildCanonicalDocumentInput`, mock provider, GI mapper.
- [ ] Stale `processing` rows (>15 min) reset to `pending` on batch run.
- [ ] Committed; `main` green.

## Test cases

1. Mock end-to-end.
2. GI sandbox sale.
3. GI sandbox refund links `originalExternalDocumentId`.
4. Duplicate enqueue idempotency (unique index).
5. Token cache hit / refresh.
6. Backoff + dead-letter.
7. Language he/en in canonical input.
8. Optional `business_tax_id` included when set on billing account.
9. Stale `processing` row older than 15 min → reset to `pending` on next batch.
