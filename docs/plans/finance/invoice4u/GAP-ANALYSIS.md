# Invoice4U ↔ Manage Studio — Gap analysis

**Verdict: YES — API covers all V1 bundled IL features.** Safe to build the wrapper.

**Docs:** [Invoice4U API](https://invoice4u.gitbook.io/invoice4u-docs) · QA base `https://apiqa.invoice4u.co.il/Services/ApiService.svc` · Prod `https://api.invoice4u.co.il/Services/ApiService.svc`

**Product decision:** Invoice4U **replaces Grow** for both payment + invoicing (single-org / single-studio). Same slug on both registries: `invoice4u` / `invoice4u`.

---

## Must-have checklist

| Manage Studio need | Invoice4U surface | Status |
|--------------------|-------------------|--------|
| Hosted checkout | `ProcessApiRequestV2` → `ClearingRedirectUrl` | ✅ |
| Async payment confirm | `CallBackUrl` POST form field `Data` (JSON strings) | ✅ |
| Idempotency / our payment ref | `OrderIdClientUsage` echoed in callback | ✅ |
| Auto tax document on charge | `IsDocCreate` (+ optional `DocItem*` line items) | ✅ |
| Document IDs + PDF | Callback / response: `DocumentId`, `DocumentNumber`, `CipherText*` | ✅ |
| Save card on first pay | `AddTokenAndCharge` | ✅ |
| Monthly renewals (app-owned) | `ChargeWithToken` + `CustomerId` (sync) | ✅ |
| Refund (full/partial) | `Refund: true` + `PaymentId` + `Sum` | ✅ |
| Credit note on refund | Auto InvoiceCredit when original charge had a doc | ✅ |
| Credential health check | `IsAuthenticated` with org API key | ✅ |
| Customers for tokens | `CreateCustomer` / `IsAutoCreateCustomer` | ✅ |
| Installments (optional) | `Type` 2/3 + `PaymentsNum` | ✅ |
| Admin settings (single user) | Org API key GUID (+ clearing company type) | ✅ |
| Mock / CI | Local mock adapter (same as Grow/iCount) | ✅ (ours) |

---

## Nice-to-have (out of V1 wrapper)

| Feature | Invoice4U | Decision |
|---------|-----------|----------|
| Standing orders (PSP-owned recurring) | `IsStandingOrderClearance` | **Do not use** — keep `run-monthly-billing` + `ChargeWithToken` so Manage Studio owns schedules/dunning |
| Bit / Apple Pay / Google Pay | Flags on clearing request | Deferred until terminal enabled |
| Silent merchant signup | Partner registration APIs | Out of scope (single-user manual key) |
| Allocation numbers (SHAAM) | `FetchAllocationNumber` | Merchant configures in Invoice4U UI |
| Draft documents | Draft endpoints | Not needed for enrol/renewal |
| Make.com connector | N/A | Not used — direct API only |

---

## Design gaps (solvable — not blockers)

| Gap | Impact | Plan resolution |
|-----|--------|-----------------|
| Token is **per Invoice4U `CustomerId`**, not an opaque card token string | Renewals need stable customer mapping | Store `CustomerId` in `payment_method_tokens.provider_token`; `ChargeWithToken` |
| `CreditCardCompanyType` required (`6`/`7`/`12`/`15`) | Must match terminal | `payment_provider_public_key` (ADR D4) |
| Callback is form `Data={...}` | Parser differs from Grow JSON | `parseInvoice4uCallback` + form peek before JSON |
| No Grow-like custom fields for metadata | Can't clone cField round-trip | **Pending `payments` row at checkout** (ADR D5) — industry-standard intent |
| Sale doc in payment callback | Not dual IPN | Finalise then `applyBundledDocumentNotify` (D3) |
| Refunds need `PaymentId` | Not our checkout UUID | On success, `provider_payment_ref := PaymentId` (D12) |
| Amounts major units | Conversion + verify | Minor internally; D17 compare callback vs pending |
| HTTP 200 + `Errors[]` | Easy to miss | Client throws on non-empty Errors (D8) |
| No callback HMAC | Auth gap | D16: HTTPS + PaymentId + amount check + clearing-log verify when available |
| Refund credit only if original had doc | Missing credit risk | Always `IsDocCreate` on card charges; fallback CreateDocument (D11) |

---

## Mapping to `PaymentProvider` / `InvoicingProvider`

| Interface method | Invoice4U |
|------------------|-----------|
| `createCharge` (hosted) | INSERT pending `payments` (D5) + `ProcessApiRequestV2` (`AddTokenAndCharge`, `IsDocCreate`); return `pageUrl`, `providerPaymentRef = OrderIdClientUsage`, `pendingWebhook: true`. |
| `createCharge` / `chargeWithToken` (renewal) | `ChargeWithToken` + `CustomerId` from `payment_method_tokens.provider_token`; sync → `emitSyncEvent` (preferred) |
| `constructEvent` | Parse form `Data=` → `PaymentEvent` + tenant peek (ADR D5); then finalise; then bundled doc apply (ADR D3) |
| `refundCharge` | `Refund` + Invoice4U `PaymentId` (must be what we stored — ADR D12) + `Sum` |
| `verifyCredentials` | `IsAuthenticated` (stub in U1 for mock; live in U2b) |
| `InvoicingProvider.issueDocument` | Stub throws (bundled) — sale/credit from clearing; optional later for cash |

**Audit note (2026-07-20):** Early draft wrongly assumed a pending `payments` row at checkout for tenant routing. Corrected in SPIKE-ADR D5/D12.

---

## Recommended renewal model

**Use app-owned billing + `ChargeWithToken`.** Do **not** register Invoice4U standing orders for V1 — that would duplicate `billing_schedules`, complicate pause/cancel/dunning, and fight existing Grow/iCount patterns.

---

## Go / no-go

| Question | Answer |
|----------|--------|
| Enough API for enrol + doc + renewal + refund? | **Yes** |
| Blocked on missing endpoint? | **No** |
| Blocked on account? | QA register + clearing terminal (Meshulam/UPAY) — ops, not API |
| Build wrapper? | **Yes — proceed to staged plan** |
