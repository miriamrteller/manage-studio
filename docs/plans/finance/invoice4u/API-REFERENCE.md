# Invoice4U API reference (wrapper subset)

Canonical docs: https://invoice4u.gitbook.io/invoice4u-docs  
OpenAPI: https://raw.githubusercontent.com/invoice4udev-hue/i4u-docs/main/openapi/invoice4u-openapi.json

All calls: **POST** + JSON wrapped params. Auth: org API key as `token` (most endpoints) or `Invoice4UUserApiKey` inside clearing `request`.

Always check `Errors` before using payload (HTTP often 200).

---

## Environments

| Env | Base URL |
|-----|----------|
| QA | `https://apiqa.invoice4u.co.il/Services/ApiService.svc` |
| Prod | `https://api.invoice4u.co.il/Services/ApiService.svc` |

QA account ≠ prod. Set `IsQaMode: true` on clearing requests against QA.

---

## Endpoints we use

### Auth

| Call | Body | Use |
|------|------|-----|
| `IsAuthenticated` | `{ "token": "<guid>" }` | `verifyCredentials` |

### Customers

| Call | Use |
|------|-----|
| `CreateCustomer` | Optional explicit customer before charge |
| (clearing) `IsAutoCreateCustomer` | Preferred on first hosted charge |

### Clearing — `ProcessApiRequestV2`

Body shape: `{ "request": { ...ApiClearingRequest } }`.

| Mode | Key flags | Result |
|------|-----------|--------|
| Hosted charge + token + doc | `AddTokenAndCharge`, `IsDocCreate`, `Sum`, customer fields, `ReturnUrl`, `CallBackUrl`, `OrderIdClientUsage`, `CreditCardCompanyType` | `ClearingRedirectUrl` |
| Hosted charge only | (no token flags), `IsDocCreate` | Same |
| Renewal | `ChargeWithToken`, `CustomerId`, `Sum`, `IsDocCreate` | Sync success/fail + optional doc |
| Refund | `Refund`, `PaymentId`, `Sum` | Sync; auto credit if original doc exists |

**Required clearing fields:** `Sum`, `CreditCardCompanyType` (`6`\|`7`\|`12`\|`15`).

### Documents (fallback / cash later)

| Call | Use |
|------|-----|
| `CreateDocument` / `CreateDocumentWithIdentifierValidation` | Cash or missing credit fallback; always set `ApiIdentifier` |
| `GetDocumentByApiIdentifier` | Idempotent fetch |

Sale path for card: prefer clearing `IsDocCreate`, not standalone create.

---

## Callback contract (hosted)

Invoice4U POSTs to `CallBackUrl` with form field `Data` = JSON object; values are strings (`"True"`/`"False"`).

Important fields:

- `Success`, `ErrorMessage`
- `OrderIdClientUsage`, `PaymentId`, `ClearingTraceId`, `Amount`
- `CustomerId`, card: `CardSuffix`, `CardExpirationDate`, `CardBrandName`
- Doc: `DocCreated`, `DocumentNumber`, `DocumentId`, `CipherText`, `CipherTextOriginal`
- Token flags: `TokenCaptureOnly`, `TokenCaptureAndCharge`

After processing, customer hits `ReturnUrl` (browser) — UX only; **never** trust ReturnUrl for fulfilment.

---

## Error codes (subset)

| ID | Name | Meaning |
|----|------|---------|
| 80 | UnauthorizedUser | Bad API key |
| 96 | ClearingTerminalDoesntExists | Terminal not configured |
| 60 | PaymentIDDoesntExists | Bad refund PaymentId |
| 134 | DocumentAlreadyCreated | Duplicate ApiIdentifier |
| 304 | ApiTokenDoesntExistForThatCustomer | Renewal without token |
| 309 | ApiTokenizationNotApprovedInClearingTerminal | Enable tokens on terminal |
| 32 | ClearingError | Decline / provider error |

---

## Env vars (proposed)

| Var | Purpose |
|-----|---------|
| `INVOICE4U_API_BASE` | Default QA URL in non-prod |
| `INVOICE4U_NOTIFY_URL` | Public `CallBackUrl` → `handle-payment-event` (or dedicated path) |
| `INVOICE4U_MOCK` | `true` → mock adapter |

Per-tenant API key + clearing company: DB encrypted credentials (not `.env`).
