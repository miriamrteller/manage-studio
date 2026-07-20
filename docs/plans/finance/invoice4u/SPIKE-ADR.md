# Invoice4U SPIKE-ADR

**Status:** Decisions D1–D19 **locked for implementation** (2026-07-20 second audit). U0-live may only *confirm* fixtures, not reopen product shape without explicit re-ADR.  
**Slug:** `invoice4u` (payment + invoicing).  
**Replaces:** Grow as target IL bundled stack for single-studio.  
**Readiness:** [PLAN-READINESS.md](PLAN-READINESS.md) — implementation-ready; not production-certified until U0-live + U7.

---

## Context

Manage Studio needs one IL provider for card capture + tax documents. Invoice4U is cheaper for single-org use and exposes both clearing and documents. Architecture already supports bundled providers (`grow`, `icount`).

## Decisions

### D1 — Bundled same slug

`payment_provider = invoicing_provider = 'invoice4u'`. Credential RPC flips both atomically and revokes non-invoice4u `payment_method_tokens`.

### D2 — App-owned renewals (not standing orders)

Initial: `AddTokenAndCharge` + `IsDocCreate`.  
Renewal: `ChargeWithToken` with stored Invoice4U `CustomerId`.  
Do **not** use `IsStandingOrderClearance` in V1.

### D3 — Single callback for pay + sale doc

Invoice4U posts payment + document fields on one `CallBackUrl`.  
**Divergence from Grow/iCount:** those use a *second* document IPN via `handle-invoice-event`. Invoice4U applies sale docs from the **payment** path.

**Required order in one request:**
1. `constructEvent` → `handlePaymentEventInternal` (INSERT payment + `finalisePayment`)
2. Then `applyBundledDocumentNotify` when `DocCreated=True` (needs payment row first — otherwise `payment_not_found`)

No separate `handle-invoice-event` parser required for sale docs.

### D4 — Credentials shape

| Field | Storage | Notes |
|-------|---------|-------|
| Org API key (GUID) | `payment_provider_secret_enc` | Required — never in `public_key` |
| Clearing company type | `payment_provider_public_key` | Plain string `"6"`/`"7"`/`"12"`/`"15"` (like Grow pageCode — non-secret config; may surface as `publishableKey`) |
| Account label | `payment_provider_account_id` | Optional org name / branch id — **not** JSON |

Admin UI: paste API key + clearing-company **select** (default Meshulam `7` unless studio uses UPAY). Do not reuse Grow “page code” copy.

### D5 — LOCKED: Pending payment row at checkout (industry-standard intent)

**Fact check:** Grow/iCount stuff metadata into PSP custom fields and insert `payments` only on success. Invoice4U does **not** give us Grow-like `cField1–4`, and `Platform` is **not** listed in the callback payload — stuffing `ChargeMetadata` into Description is unsafe (user-visible) and length-risky.

**Locked approach (intentional divergence from Grow — closer to PaymentIntent-before-redirect):**

1. At `createCharge` (hosted): INSERT `payments` with `status = 'pending'`, `provider_payment_ref = OrderIdClientUsage` (UUID), full amount/engagement/tenant columns filled from `ChargeMetadata`.  
2. Call Invoice4U with that same `OrderIdClientUsage`.  
3. On callback: form-parse `Data=` → peek tenant from pending row (lookup by `OrderIdClientUsage`) **or** from `OrderIdClientUsage` prefix `ms1.{tenantId}.{uuid}` as belt-and-suspenders.  
4. Upgrade row: `status → succeeded|failed`, apply D12 PaymentId, then `finalisePayment`, then doc apply (D3).

`handle-payment-event` must accept form bodies and invoice4u peek **before** JSON/Grow peek.

ReturnUrl = UX only — **never** fulfilment.

**Abandoned for V1:** metadata-only encoding in Description; pending-row-free Grow clone.

### D6 — Customer / token persistence

1. On checkout: `IsAutoCreateCustomer: true` (or prior `CreateCustomer`).  
2. On success callback: upsert `payment_method_tokens` with `provider = 'invoice4u'`, `provider_token = String(CustomerId)` (or `i4u:{id}`), plus brand/last4/expiry.  
3. Optionally set `engagements.provider_customer_ref` (renewal-billing already passes `customerRef`).  
4. There is **no** `customerRef` column on `payment_method_tokens` — use `provider_token`.

### D7 — Amounts & currency

App uses minor units (agorot). Adapter converts to/from major `Sum`. Currency `NIS` for ILS.

### D8 — Errors & HTTP

Client treats non-empty `Errors` as failure even when HTTP 200. Map known IDs (80, 96, 304, 309, …) to user-facing messages.

### D9 — Mock first

`INVOICE4U_MOCK=true` → `MockInvoice4uPaymentProvider` (`mock.invoice4u.local`), same confirm-mock-payment path as Grow/iCount.

### D10 — Grow dormancy

After Invoice4U mock + QA E2E green for target tenant: set that tenant to `invoice4u`/`invoice4u`. Grow remains in registry (dormant) until unused; do not delete adapters in U stages.

### D11 — Refund credits

Prefer Invoice4U auto credit on `Refund` when original had `IsDocCreate`. If response lacks credit doc fields, enqueue refund document or call `CreateDocument` credit with `ApiIdentifier` — decide in U0-live after capturing a real refund response.

### D12 — LOCKED: `provider_payment_ref` becomes Invoice4U `PaymentId` on success

Invoice4U docs: keep `PaymentId` for refunds. `process-refund` only passes `payments.provider_payment_ref`.

**Locked (with D5 pending row):**

1. Checkout: `provider_payment_ref = OrderIdClientUsage` (UUID), status `pending`.  
2. Success callback: UPDATE same row → `provider_payment_ref = PaymentId`, status `succeeded` (UNIQUE constraint: PaymentId must not already exist).  
3. Idempotent replay: lookup by `PaymentId` **or** by original `OrderIdClientUsage` if still pending; never double-finalise.  
4. `applyBundledDocumentNotify` uses **post-update** `PaymentId` as `providerPaymentRef` (same request, after upgrade).  
5. Refunds: `refundCharge({ providerPaymentRef: PaymentId })`.

Store `OrderIdClientUsage` in `payments.description` suffix or audit `after_state` if needed for support — optional.

### D13 — U3 before U2b: verify stub

`verify-invoice4u-credentials` must exist in **U1** as mock-friendly stub (`INVOICE4U_MOCK` → `{ valid: true }`; live → U2b). Otherwise U3 “Test connection” blocks.

### D14 — LOCKED: Renewal dispatch

`renewal-billing.ts`: add `invoice4u` → `chargeWithToken` (CustomerId in `provider_token`).  
Renewals are **sync**: no pending hosted row; INSERT succeeded (or failed event) from response; `IsDocCreate: true`; apply doc fields from response when present.

### D15 — LOCKED: ChargeMetadata source of truth

For hosted charges, metadata lives on the **pending `payments` row** (+ engagement FKs), not in PSP custom fields.  
`constructEvent` loads pending row by `OrderIdClientUsage` to build `PaymentEvent.metadata` / amounts.

### D16 — LOCKED: Callback authenticity (minimum bar)

Invoice4U documents no HMAC. Industry minimum for this API:

1. HTTPS `CallBackUrl` only.  
2. Reject missing/`Success` without `PaymentId` on success path.  
3. **Amount check (D17)** against pending row.  
4. **Recommended before fulfilling:** confirm charge via clearing-log / get-by-PaymentId API when available (U0-live names the exact call). If unavailable, (1)–(3) + shared path secret query param (`s=` HMAC of tenant+order) as defense in depth.  
5. Never trust ReturnUrl.

### D17 — LOCKED: Amount verification

On success callback, compare callback `Amount` (major units → minor) to pending `total_amount_minor`. Mismatch → **do not** finalise; audit log + alert. (Standard anti-tamper.)

### D18 — LOCKED: Failure callbacks

`Success=False` → `payment.failed` path (dunning for renewals; audit for initial). Mark pending row `failed` if present. Do not activate engagement.

### D19 — LOCKED: PDF / document URL

Build `documentUrl` from callback `CipherText` / `CipherTextOriginal` using QA vs prod view hosts (`newviewqa` / `newview`) per Invoice4U docs — exact URL template captured in U0-live fixture. Pass into `applyBundledDocumentNotify`.

### D20 — Cash / offline for invoice4u tenants

V1 card path only via clearing. Offline `record-payment` still works; sale tax doc for cash either stays on `invoicing_provider=mock` for that flow or a later `CreateDocument` story — **out of U1–U4 card wrapper scope**. Document in runbook.

## Open questions (U0-live confirms — **block U2b**, do not reopen locks without re-ADR)

1. Exact callback Content-Type / `Data=` encoding.  
2. Clearing-log (or equivalent) verify endpoint name + latency for D16.4.  
3. `ChargeWithToken` response document field names when `IsDocCreate`.  
4. Partial refund same-day rules for Meshulam vs UPay.  
5. PDF URL template from `CipherText`.  
6. Max length of `OrderIdClientUsage` (UUID is fine; confirm).  
7. Whether pending→succeeded UPDATE of `provider_payment_ref` races UNIQUE in practice (fixture).

## Alternatives considered

| Option | Why rejected |
|--------|--------------|
| Grow via Make.com | Extra hop; not a product gateway; fees unchanged |
| Invoice4U standing orders | Duplicates billing ownership |
| Split Invoice4U pay + Green Invoice | Unnecessary cost/complexity for single studio |
| Keep Grow as V1 default | Product chose Invoice4U on price for single system |
