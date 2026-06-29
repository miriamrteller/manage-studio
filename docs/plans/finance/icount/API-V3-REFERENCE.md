# iCount API v3 — reference (plan supplement)

**Purpose:** Map OpalSwift integration rows to the **REST API v3** surface. Complements [SPIKE-ADR.md](SPIKE-ADR.md) (architecture) and the **help center** (hosted checkout + IPN + document webhooks).

**I0-doc** used help center only. This file closes the gap: help has **no REST API** detail; [apiv3.icount.co.il](https://apiv3.icount.co.il/) has **no CC-page / IPN** detail. Both are required.

---

## Two documentation surfaces

| Surface | URL | Covers | OpalSwift use |
|---------|-----|--------|---------------|
| **Help center** | [help.icount.co.il](https://help.icount.co.il/) | CC page redirect, IPN field table, document webhook JSON | Rows #2, #5, #6, #7, #8 |
| **API v3 (interactive)** | [apiv3.icount.co.il](https://apiv3.icount.co.il/) | Module/method catalog, params, samples | Rows #1, #3, #4, #9, #10, #11 (partial), **I6** |
| **Module index snapshot** | [fixtures/apiv3-module-index.json](fixtures/apiv3-module-index.json) | Offline copy of apiv3 sidebar (2026-06-29) | Agents / CI without fetching apiv3 |

Refresh snapshot when probing I0-live:

```bash
curl -sL "https://apiv3.icount.co.il/new_api_docs/index.json.php" \
  -o docs/plans/finance/icount/fixtures/apiv3-module-index.json
```

---

## HTTP contract (all API v3 calls)

| Item | Value |
|------|--------|
| **Base URL** | `https://api.icount.co.il/api/v3.php` |
| **Path pattern** | `POST /api/v3.php/{module}/{method}` |
| **Auth** | `Authorization: Bearer {API token}` (Settings → API) |
| **Body** | **`application/x-www-form-urlencoded`** (not JSON) — confirm per method in apiv3 |
| **Response** | JSON; check `status` / `error_description` |
| **Interactive doc route** | `https://apiv3.icount.co.il/#/module/{module}/{method}` |
| **Live module list** | `GET https://api.icount.co.il/api/v3.php/help/modules?format=json&no_auth=1&no_status=1` |

**Not in API v3:** CC page payer redirect (#2) and IPN POST (#6) — help center only.

---

## Catalog row → API v3 mapping

Links use apiv3 hash routes. **Sandbox: pending** until [I0-live](stage-i0-live-spike.md) records request/response samples.

| SPIKE # | OpalSwift | API v3 module(s) | Methods (apiv3) | apiv3 link | I0-live probe |
|---------|-----------|------------------|-----------------|------------|---------------|
| **1** | `verifyCredentials` | `auth`, `company`, `cc` | `auth/info`, `company/info`, `cc/provider` | [#/module/auth/info](https://apiv3.icount.co.il/#/module/auth/info) · [#/module/company/info](https://apiv3.icount.co.il/#/module/company/info) · [#/module/cc/provider](https://apiv3.icount.co.il/#/module/cc/provider) | Pick lightest 200 probe; record rate-limit headers |
| **2** | `createCharge` | — | *(redirect only)* | Help: [create-cc-page](https://help.icount.co.il/credit-card-processing/create-cc-page/) | CC page URL + simulator payment |
| **3** | `chargeWithToken` / renewals | `cc`, `cc_storage`, `hk` | `cc/bill`, `cc/get_token_info`, `cc_storage/token_info`, `hk/charge`, `hk/create` | [#/module/cc/bill](https://apiv3.icount.co.il/#/module/cc/bill) · [#/module/hk/charge](https://apiv3.icount.co.il/#/module/hk/charge) | **Renewals decision A/B/C** — see SPIKE-ADR |
| **4** | `refundCharge` | `doc`, `cc` | `doc/cancel`, `doc/create` (`doctype=refund`), `cc/transactions` | [#/module/doc/cancel](https://apiv3.icount.co.il/#/module/doc/cancel) · [#/module/doc/create](https://apiv3.icount.co.il/#/module/doc/create) | Confirm credit-note + terminal refund path |
| **5** | Post-payment ack | — | N/A | Help IPN section | N/A |
| **6** | IPN / `handle-payment-event` | — | *(webhook POST, not REST)* | Help: [create-cc-page IPN](https://help.icount.co.il/credit-card-processing/create-cc-page/) | Capture `icount-ipn-notify.json` |
| **7–8** | Document webhook | `webhook` (config only) | `webhook/add`, `webhook/get_list` | [#/module/webhook/add](https://apiv3.icount.co.il/#/module/webhook/add) | Payload shape = help; config may use API |
| **9** | `issueDocument` (Option C) | `doc` | `doc/types`, `doc/create` | [#/module/doc/create](https://apiv3.icount.co.il/#/module/doc/create) | Form-encoded sample in RUNBOOK |
| **10** | Client upsert | `client` | `client/create`, `client/create_or_update`, `client/info`, `client/get_cc_tokens` | [#/module/client/create](https://apiv3.icount.co.il/#/module/client/create) | Only if CC page requires pre-created client |
| **11** | Resend document | `doc` | `doc/email` (not webhook replay) | [#/module/doc/email](https://apiv3.icount.co.il/#/module/doc/email) | Admin resend may stay UI-only |
| **I6** | Silent signup | `registration` | `register`, `wizard`, `otp_*`, `cid_valid`, `cid_available` | [#/module/registration/register](https://apiv3.icount.co.il/#/module/registration/register) | Partner creds + legal review |

### Related modules (not primary catalog rows)

| Module | Methods | Notes |
|--------|---------|-------|
| `paypage` | `get_list`, `create`, `generate_sale`, … | PayPages API — **not** the same as CC page `/m/{cp}` redirect; do not conflate with #2 |
| `cc_storage` | `store`, `update`, `delete`, `token_info` | Saved-card vault; pairs with `cc/bill` for token charges |
| `autoinvoice` | `search`, `info`, `update`, `cancel` | Receipt autoinvoice — verify if bundled flow touches this |

---

## `doc/create` essentials (Option C / refunds)

From apiv3 + community-verified samples — **re-validate in I0-live**:

```
POST https://api.icount.co.il/api/v3.php/doc/create
Authorization: Bearer {token}
Content-Type: application/x-www-form-urlencoded

doctype=invrec          # doc/types for full list (invrec, refund, receipt, …)
client_id={id}          # or inline client_name=
doc_date=YYYYMMDD
desc[0]=…&unitprice[0]=…&quantity[0]=1
```

Common `doctype` values: `invrec`, `invoice`, `receipt`, `refund`, `offer`, `order` — call `doc/types` in sandbox.

---

## What apiv3 is **not** enough for

Even with this reference, you still need:

1. **Raw IPN capture** (`icount-ipn-notify.json`) — help + sandbox only  
2. **Live document webhook sample** — compare to official help fixture  
3. **Renewals go/no-go** — `cc/bill` vs `hk/charge` vs defer (SPIKE-ADR outcome A/B/C)  
4. **Webhook verification** — IPN may have no HMAC; document webhook security from capture  
5. **Rate limits** — record from probe responses → [ADAPTER-PATTERNS.md](ADAPTER-PATTERNS.md)

---

## Stage usage

| Stage | Use this doc |
|-------|----------------|
| **I2a** | Row mapping only; no live calls |
| **I0-live** | Probe checklist per row; refresh module index |
| **I2b** | Implement #1 live probe; IPN still from capture |
| **I4** | #3, #4 module methods after renewals/refunds decision |
| **I6-research** | `#/module/registration/*` + partner policy |

---

## See also

- [SPIKE-ADR.md](SPIKE-ADR.md) — catalog #29, Option A′  
- [RUNBOOK.md](RUNBOOK.md) — Phase B sandbox + secrets  
- [GLOSSARY.md](GLOSSARY.md) — `cp`, `cid`, token  
- [stage-i0-live-spike.md](stage-i0-live-spike.md) — capture DoD  
- [stage-i6-silent-provisioning.md](stage-i6-silent-provisioning.md) — registration module
