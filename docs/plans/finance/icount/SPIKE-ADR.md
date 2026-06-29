# SPIKE-ADR — iCount integration architecture

**Status:** Draft (architecture locked from help docs) — **live approval** pending [I0-live](stage-i0-live-spike.md)  
**Date:** 2026-06-28  
**Epic:** Add iCount as bundled IL default; Grow stays supported  
**Track:** [Mock-first, account-last](00-overview.md#mock-first-account-last-track)

---

## Decision (proposed)

**Option A′ — CC Page redirect + IPN + Document Webhook** (bundled iCount)

iCount’s published integration for hosted checkout is **not** a Grow-style REST `createPaymentProcess` call. The official model is:

1. **Redirect** the payer to a configured CC page URL (`https://app.icount.co.il/m/{page_id}`) with query parameters for amount, description, success URL, and IPN URL.
2. **IPN (Instant Payment Notification)** — server-to-server POST on successful charge; includes payment + document identifiers (`doctype`, `docnum`, `confirmation_code`, etc.).
3. **Document Webhook** (optional second channel) — JSON POST with full document payload including `pdf_link`, `doc_link`, line items, and `cc_payments`.

OpalSwift `IcountPaymentProvider.createCharge` therefore returns a **built redirect URL** (`pageUrl`), not a response from a charge-creation API.

**Grow remains unchanged.** This ADR adds a parallel adapter path.

### Fallback options (only if go/no-go fails)

| Option | When |
|--------|------|
| **B** — iCount invoicing only + keep Grow/Stripe payments | IPN + webhooks work but CC page model blocked |
| **C** — iCount payment + `doc/create` API after payment | Bundled doc not reliable; explicit queue path |
| Manual renewal billing | No API for saved-card / standing-order charge (#3 catalog row) |

---

## API Reference Catalog (#29)

Each row cites **official documentation**. Rows marked **Sandbox: pending** require [I0-live](stage-i0-live-spike.md) before **I2b** implements live parsers/API calls. **I1 / I2a / I3** use mocks + official fixtures only.

| # | Our method / handler | iCount surface (official) | HTTP | Doc URL | Sandbox |
|---|----------------------|---------------------------|------|---------|---------|
| 1 | `verifyCredentials` | API v3 module (auth required) — e.g. probe via authenticated API token | POST | [API v3 overview](https://www.icount.co.il/features/api/) · base `https://api.icount.co.il/api/v3.php/` (returns `auth_required` without token) | **pending** — exact module TBD with token |
| 2 | `createCharge` | CC page redirect: `https://app.icount.co.il/m/{cp}?cs=&cd=&success_url=&ipn_url=&m__*` | GET redirect | [create-cc-page — URL params + IPN](https://help.icount.co.il/credit-card-processing/create-cc-page/) | **pending** — capture built URL + payer flow |
| 3 | `chargeWithToken` (renewals) | Saved-card charge / standing order — help describes UI + HK module; **API module not documented in help center** | TBD | [storing-credit-cards](https://help.icount.co.il/credit-card-processing/storing-credit-cards/) · [standing-orders](https://help.icount.co.il/standing-orders/) | **pending — go/no-go blocker for auto-renewal** |
| 4 | `refundCharge` | Credit note / refund document + terminal refund — help references credit docs and clearing-terminal refund | TBD | [credit-card-from-iphone — refund note](https://help.icount.co.il/credit-card-processing/credit-card-from-iphone/) · API v3 `doc/*` (authenticated) | **pending** |
| 5 | Post-payment ack (#7) | **N/A** — no Grow `approveTransaction` equivalent in published CC page / IPN docs | — | [create-cc-page IPN section](https://help.icount.co.il/credit-card-processing/create-cc-page/) | N/A |
| 6 | `constructEvent` / `handle-payment-event` | CC page **IPN** — POST with fields `cp`, `sum`, `currency_code`, `confirmation_code`, `doctype`, `docnum`, `customer_*`, custom `m__*` echoed without prefix | POST | [create-cc-page — IPN field table](https://help.icount.co.il/credit-card-processing/create-cc-page/) | **pending** — capture raw POST body + Content-Type |
| 7 | `parseIcount*Notify` / `handle-invoice-event` | **Document Webhook** — JSON array of document objects | POST | [integration/webhooks — full example](https://help.icount.co.il/integration/webhooks/) | **partial** — official example fixture committed; live capture still recommended |
| 8 | `handle-payment-document` | `pdf_link` (+ optional `doc_link`) on document webhook payload | IN | [integration/webhooks — `pdf_link` in example](https://help.icount.co.il/integration/webhooks/) | **partial** — same as row 7 |
| 9 | `issueDocument` (Option C only) | API v3 `doc/create` (form-encoded per API v3 convention) | POST | [API v3 overview](https://www.icount.co.il/features/api/) | N/A for Option A′ |
| 10 | Client upsert (if required) | API v3 client module | POST | [API v3 overview](https://www.icount.co.il/features/api/) | **pending** — only if pay flow requires pre-created `client_id` |
| 11 | `admin-resend-document` | UI “resend WebHook” from document search — no public REST path documented | UI | [integration/webhooks — resend section](https://help.icount.co.il/integration/webhooks/) | N/A — manual ops only |

---

## Architecture notes (from official docs)

### Hosted checkout (#2)

CC page base pattern (from help center):

```
https://app.icount.co.il/m/{cp}?cs={amount}&cd={description}&success_url={url}&ipn_url={url}&failure_url={url}&cancel_url={url}
```

Documented query parameters include `cs`, `cd`, `currency_id`, customer fields (`full_name`, `contact_email`, …), and redirect URLs. See [create-cc-page parameter table](https://help.icount.co.il/credit-card-processing/create-cc-page/).

**Custom metadata (tenant routing #3):** Fields passed with `m__` prefix on the redirect URL are echoed in IPN **with the prefix removed** (official rule). OpalSwift should pass at minimum:

- `m__tenant_id`
- `m__payment_id` (our idempotency / payment row correlation)
- `m__engagement_id` (and other canonical metadata as needed)

Map IPN field names in adapter after sandbox capture confirms casing.

### Payment notify / IPN (#6)

Official IPN fields (subset — see help for full table):

| Field | Type | Use in OpalSwift |
|-------|------|------------------|
| `cp` | int | CC page id |
| `sum` | float | Amount paid |
| `currency_code` | char(3) | Currency |
| `confirmation_code` | string | Provider auth code → `provider_payment_ref` candidate |
| `doctype` | string | Bundled document type (e.g. `invrec`) |
| `docnum` | int | Bundled document number |
| `num_of_payments` | int | Installments |
| `customer_id` | int | iCount internal client id |
| `customer_email` | string | Payer |
| Custom | varies | Fields from `m__*` prefix |

**Open until sandbox:** POST `Content-Type` (form vs JSON), signature/HMAC (not documented on IPN page — verify in capture), and stable idempotency key field for `provider_payment_ref`.

### Document webhook (#7 / #8)

- Module: System → Settings → Modules → **WebHooks** ON; configure URL under Automation.
- Payload: JSON **array** of document objects (can be large).
- Example includes `doctype`, `docnum`, `totalwithvat`, `pdf_link`, `doc_link`, `cc_payments[]`, `client`, `items[]`.
- **No `tenant_id` in official example** → implement Risk #22 fallback: lookup `payments` by `provider_payment_ref` from `cc_payments[].deal_id` or `confirmation_code` correlation defined after IPN capture.

Handler mapping (#6):

| Callback | Edge handler | Purpose |
|----------|--------------|---------|
| IPN | `handle-payment-event` | Payment success → `finalisePayment` |
| Document Webhook | `handle-invoice-event` | Upsert `external_document_*`, `invoice_url`, bundled skip |
| PDF retention | `handle-payment-document` (I4) | Fetch/store `pdf_link` if required |

If IPN already includes `doctype` + `docnum`, document webhook may be redundant for bundled skip — still implement both; ordering may be IPN-first or webhook-first (mirror Grow G4 rules).

### Post-payment ack (#7)

**Decision: N/A.** Published CC page + IPN flow has no documented ack step analogous to Grow `approveTransaction`. Adapter must not invent one.

### Credentials (#28)

| Tenant column | iCount mapping (proposed) |
|---------------|---------------------------|
| `payment_provider_account_id` | iCount company id (`cid`) — confirm in sandbox |
| `payment_provider_public_key` | CC page id (`cp`) |
| `payment_provider_secret_enc` | API token (Settings → API) |
| `payment_provider_webhook_enc` | If IPN/webhook signing exists — **confirm in sandbox** (#8) |
| `invoicing_*` | Same as payment for bundled `icount/icount` |

Settings UI (I3): **API token + CC page id (+ cid if required)** — not Grow-style pageCode/userId unless sandbox proves otherwise.

### Webhook secret storage (#8)

**Proposed:** `payment_provider_webhook_enc` + `save_icount_webhook_secret` RPC (Stripe pattern). Do **not** generalize `grow_webhook_secrets` (#19 deferred).

If sandbox shows **no signature** on IPN/document webhooks, ADR records verification as “URL secrecy + idempotency only” and documents risk.

---

## Go/no-go checklist

| Item | Status | Catalog row |
|------|--------|-------------|
| API catalog complete (no blank required rows) | **Partial** — rows 3, 4, 6, 10 pending sandbox | #29 |
| Tenant routing via `m__tenant_id` in IPN | **Designed** — must verify in sandbox | #3, #6 |
| Hosted checkout (redirect + IPN) | **Documented** — sandbox pending | #2, #6 |
| Payment webhook shape + verification | **Fields documented** — raw capture pending | #6 |
| Post-payment ack | **N/A** | #5 |
| Document delivery → handler mapping | **Documented** | #7, #8 |
| Saved card / standing order API (renewals) | **Not documented in help — sandbox/API docs required** | #3 |
| Refund API | **Pending** | #4 |
| Webhook secret storage | **Proposed** (#8 above) | #8 |
| Rate limits | API v3: verify in authenticated docs | — |
| Sandbox credentials | **User action required** | — |

### Stage gates (mock-first track)

| Gate | When | Unblocks |
|------|------|----------|
| **I0-doc** | Help docs + draft ADR + official fixtures | **I1, I3, I2a** |
| **I0-live** | Account + IPN capture + ADR approval | **I2b, I5**; I4 renewals/refunds |

**Proceed to I1** when user accepts draft architecture (Option A′). **Do not** wait for an iCount account or `icount-ipn-notify.json`.

**Proceed to I2b / I5** only when I0-live DoD passes:

- [ ] `icount-ipn-notify.json` committed (sandbox capture)
- [ ] `m__tenant_id` routing verified live (or fallback signed off)
- [ ] Renewals (#3): API confirmed **or** deferral documented
- [ ] Refunds (#4): API confirmed **or** deferral documented
- [ ] SPIKE-ADR approval row signed

**Block Option A′ for production default (I5)** if live IPN cannot carry correlatable payment id + tenant metadata.

---

## Credential mapping

See table in § Credentials (#28). All tax fields (`vat_type`, `invoice_license_number`) are **opaque pass-through** only — OpalSwift does not interpret.

---

## Tax & legal delegation

Unchanged from [00-overview.md](00-overview.md): iCount owns all tax document legality; adapters store `external_document_*` only.

---

## Fixtures

| File | Source | Used in |
|------|--------|---------|
| `icount-document-webhook-official-example.json` | Help center official example | I2a+ |
| `icount-ipn-official-fields.json` | Official IPN field catalog (not a notify body) | Reference only |
| `icount-ipn-notify.json` | **I0-live** sandbox capture | I2b+ |

---

## Approval

| Gate | Approved |
|------|----------|
| **Draft architecture (I0-doc)** — Option A′ acceptable for mock build | ☐ |
| **Live integration (I0-live)** — IPN capture + catalog complete for production | ☐ |

**I1 may start** after draft architecture sign-off. **I5 may start** only after live integration sign-off.
