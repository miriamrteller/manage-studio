# Stage I4a — PDF retention + refund UI (no account)

**Status:** Complete (2026-06-29)  
**Prerequisite:** I2a complete; I4-mock-parity complete; token invalidation migration shipped  
**Blocks:** Nothing — safe before I0-live  
**Related:** [stage-i4-parity.md](stage-i4-parity.md), [stage-i4-mock-parity.md](stage-i4-mock-parity.md), [SPIKE-ADR.md](SPIKE-ADR.md) rows #7–8, [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md)

---

## Current state

| I4a item | Status |
|----------|--------|
| Token invalidation on credential RPC (#9) | **Done** — `20260629000100_provider_token_invalidation.sql`, I4-T5 |
| PDF retention for iCount `pdf_link` (#6 / SPIKE #8) | **Done** |
| `RefundPaymentModal` bundled-provider copy (#14) | **Done** |

---

## Problem

### PDF

Two document paths exist today:

| Path | Provider | PDF download to `legal-documents`? |
|------|----------|----------------------------------|
| `handle-invoice-event` → `applyBundledDocumentNotify` | Grow + iCount | **No** — sets `invoice_url` only |
| `handle-payment-document` | Grow only | **Yes** — `document_pdf_path`, `document_stored_at` |

iCount document webhooks (official JSON array with `pdf_link`) already parse in I2a via `parseIcountDocumentWebhook` → `documentUrl` from `pdf_link ?? doc_link`. They never fetch/store the PDF.

Grow’s **duplicate** entry points (`handle-invoice-event` vs `handle-payment-document`) also diverge on retention.

### Refund UI

`RefundPaymentModal` shows a provider note only when `provider === 'grow'`. iCount tenants see no bundled-provider guidance; mock/live refunds already dispatch by payment row slug (I4-T3/T4).

---

## Architecture decision

**Do not route iCount document webhooks through `handle-payment-document`.** Per SPIKE-ADR, iCount documents arrive on **`handle-invoice-event`** (row #7). Row #8 is the shared **PDF retention** concern, not a second edge URL for iCount.

**Chosen approach:**

1. Extract shared **`fetchAndStoreBundledDocumentPdf`** from existing `handle-payment-document` logic.
2. Call it from **`applyBundledDocumentNotify`** when `parsed.documentUrl` is present (Grow + iCount, both via `handle-invoice-event`).
3. Refactor **`handle-payment-document`** to use the same helper (DRY; Grow dashboard endpoint unchanged).
4. Persist the same columns both paths already expect where applicable:
   - `document_pdf_path`
   - `document_stored_at`
   - Keep `invoice_url`, `external_document_id`, `invoice_issued_at` from `applyBundledDocumentNotify`

PDF fetch failures remain **non-fatal** (log + store URL only) — match existing Grow behavior in `handle-payment-document`.

```text
iCount document webhook
  → handle-invoice-event
  → parseIcountDocumentWebhook (pdf_link → documentUrl)
  → applyBundledDocumentNotify
  → fetchAndStoreBundledDocumentPdf (new)
  → payment row updated

Grow document webhook (same pipeline via handle-invoice-event)
  → parseGrowInvoiceNotify → applyBundledDocumentNotify → shared PDF helper

Grow handle-payment-document (legacy/alternate Grow endpoint)
  → parseGrowInvoiceNotify → shared PDF helper + same payment update shape
```

---

## Scope IN

### I4a-1 — Shared PDF helper

**New module:** `supabase/functions/_shared/payments/bundled-document-pdf.ts`

```typescript
export async function fetchAndStoreBundledDocumentPdf(
  service: SupabaseClient,
  params: {
    tenantId: string;
    providerPaymentRef: string;
    externalDocumentId: string;
    documentUrl: string;
  },
): Promise<{ pdfPath: string | null }>
```

- Path pattern (unchanged): `documents/{tenantId}/{providerPaymentRef}/{externalDocumentId}.pdf`
- Bucket: `legal-documents`, `upsert: false`
- 30s fetch timeout (match existing)
- Return `null` path on failure — caller continues

### I4a-2 — Wire into `applyBundledDocumentNotify`

**File:** `supabase/functions/_shared/payments/bundled-document.ts`

After successful payment row update, if `parsed.documentUrl`:

- Call `fetchAndStoreBundledDocumentPdf`
- Set `document_pdf_path`, `document_stored_at` on the payment row (second update or single combined update)

Idempotency: if `external_document_id` already set, skip (existing duplicate guard).

### I4a-3 — Refactor `handle-payment-document`

**File:** `supabase/functions/handle-payment-document/index.ts`

- Replace inline fetch/upload block with shared helper
- Keep Grow-only parsing and HTTP contract unchanged
- Avoid double-updating if Grow sends both webhooks — idempotency on `external_document_id` / same `document_pdf_path` must hold

### I4a-4 — `RefundPaymentModal` bundled copy

**File:** `apps/web/src/features/finance/components/RefundPaymentModal.tsx`

Replace Grow-only branch with slug-aware notes:

| `provider` | Copy intent |
|------------|-------------|
| `grow` | Same-day full refund limitation (keep existing string / i18n key) |
| `icount` | Credit-note / provider rejection message may appear; mock uses instant success |
| other / undefined | Generic: “Refund is sent to your payment provider…” |

Prefer **separate i18n keys** (`grow_note`, `icount_note`, `bundled_note`) over one vague string — each provider’s docs differ.

No backend changes — `process-refund` already slug-dispatches.

---

## Scope OUT

- Live iCount refund HTTP (I4-live / I0-live)
- New edge functions for iCount documents
- Changing webhook registration URLs
- I5 seed flip

---

## TDD (write tests first)

| File | Cases |
|------|-------|
| `apps/web/src/__tests__/bundled-document-pdf.test.ts` **(new)** | Mock `fetch` + storage upload; success sets path; fetch failure returns null; path pattern |
| `apps/web/src/__tests__/icount-document-pdf-retention.test.ts` **(new)** | `handleInvoiceEventInternal` + official fixture → `document_pdf_path` set when fetch mocked OK |
| `apps/web/src/__tests__/handle-invoice-event-isolation.test.ts` | Extend — Grow regression still green after shared PDF hook |
| `apps/web/src/__tests__/icount-mock-document-path.test.ts` | Extend — document path asserts PDF columns when helper mocked |
| `apps/web/src/__tests__/RefundPaymentModal.test.tsx` **(new, optional)** | Renders `icount` note vs `grow` note |

**I4a-T1 … I4a-T4** (add to PROVIDER-ISOLATION-TDD after implementation):

| # | Assert |
|---|--------|
| I4a-T1 | iCount document fixture → `pdf_link` stored; `document_pdf_path` when fetch succeeds |
| I4a-T2 | Grow document via `handle-invoice-event` still applies (regression) |
| I4a-T3 | `handle-payment-document` Grow path still works (shared helper) |
| I4a-T4 | `RefundPaymentModal` shows provider-appropriate note for `grow` and `icount` |

---

## Files to touch

| File | Change |
|------|--------|
| `supabase/functions/_shared/payments/bundled-document-pdf.ts` | **New** — fetch + storage |
| `supabase/functions/_shared/payments/bundled-document.ts` | Call PDF helper |
| `supabase/functions/handle-payment-document/index.ts` | Refactor to shared helper |
| `apps/web/src/features/finance/components/RefundPaymentModal.tsx` | Bundled copy |
| `apps/web/src/__tests__/bundled-document-pdf.test.ts` | **New** |
| `apps/web/src/__tests__/icount-document-pdf-retention.test.ts` | **New** |
| `docs/plans/finance/icount/PROVIDER-ISOLATION-TDD.md` | I4a-T1…T4 rows |
| `docs/plans/finance/icount/stage-i4-parity.md` | Link here; check I4a items when done |

---

## DoD

- [x] `fetchAndStoreBundledDocumentPdf` extracted; Grow `handle-payment-document` uses it
- [x] iCount official fixture path stores PDF when fetch mocked success
- [x] `applyBundledDocumentNotify` sets `document_pdf_path` + `document_stored_at` when URL present
- [x] `RefundPaymentModal` shows `icount` + `grow` notes (not grow-only)
- [x] I4a-T1…T4 green
- [x] Grow document + refund regression green
- [x] Token invalidation (I4-T5) still green — no RPC changes expected

---

## Agent prompt

```
Implement I4a per docs/plans/finance/icount/stage-i4a-no-account.md.

Read first:
@docs/plans/finance/icount/stage-i4a-no-account.md
@docs/plans/finance/icount/stage-i4-parity.md
@supabase/functions/_shared/payments/bundled-document.ts
@supabase/functions/handle-payment-document/index.ts
@supabase/functions/_shared/payments/handle-invoice-event.ts
@supabase/functions/_shared/payments/icount/document.ts
@apps/web/src/__tests__/fixtures/icount-document-webhook-official-example.json
@apps/web/src/__tests__/icount-mock-document-path.test.ts
@apps/web/src/features/finance/components/RefundPaymentModal.tsx

TDD first:
1. bundled-document-pdf.test.ts — mock fetch/storage for fetchAndStoreBundledDocumentPdf
2. icount-document-pdf-retention.test.ts — handleInvoiceEventInternal + official fixture → document_pdf_path
3. Implement bundled-document-pdf.ts; wire into applyBundledDocumentNotify
4. Refactor handle-payment-document to use shared helper (Grow HTTP contract unchanged)
5. RefundPaymentModal: grow + icount i18n notes (keep grow text; add icount_note)
6. Add I4a-T1…T4 to PROVIDER-ISOLATION-TDD.md; update stage-i4-parity.md I4a checkboxes

Constraints:
- iCount documents stay on handle-invoice-event — do NOT route icount through handle-payment-document
- PDF fetch failure non-fatal (URL-only fallback)
- Idempotent on external_document_id / duplicate webhooks
- Do not commit unless asked
- Run: pnpm -C apps/web test bundled-document-pdf icount-document-pdf-retention icount-mock-document-path handle-invoice-event-isolation provider-isolation-renewal-refund RefundPaymentModal
```

---

## After I4a

Mock-phase integration is **complete**. See [00-overview.md § Mock-phase milestone](00-overview.md#mock-phase-milestone--complete).

**While finishing other project work (optional parallel):**

1. **I6-research** → `I6-ADR.md`
2. **G8-research** → `G8-ADR.md` (optional)

**Deferred integration week (end of project — needs iCount account):**

1. **I0-live** → **I2b** → **I4-live** → **I5** → **I6-impl** (V1 complete)
