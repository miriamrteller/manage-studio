# Grow (Meshulam) Light API — reference (plan supplement)

**Purpose:** Map OpalSwift Grow adapter methods to **official Grow Light API** docs. Complements [GROW-RUNBOOK.md](GROW-RUNBOOK.md) (operations) and the **integration code** in `supabase/functions/_shared/payments/providers/grow.ts`.

**Not covered here:** Silent merchant signup — see [stage-g8-silent-provisioning.md](stage-g8-silent-provisioning.md) (G8-research).

---

## Documentation surfaces

| Surface | URL | Covers |
|---------|-----|--------|
| **Light API (primary)** | [grow-il.readme.io](https://grow-il.readme.io/docs/light-api) | Payment process, approve, token charge, refunds, webhooks |
| **Developer portal (marketing)** | [grow.business/api-developers](https://grow.business/api-developers/) | Overview, marketplace/multi-business, Postman |
| **Sandbox base** | `https://sandbox.meshulam.co.il/api/light/server/1.0` | Dev (`GROW_API_BASE`) |
| **Production base** | `https://api.meshulam.co.il/api/light/server/1.0` | Live |
| **Help / ops** | [GROW-RUNBOOK.md](GROW-RUNBOOK.md) | SHAAM, webhooks, env vars |

Grow uses **JSON POST** to `{base}/{methodName}` (unlike iCount API v3 form-encoding).

---

## Implemented adapter → Light API mapping

| OpalSwift | Light API method | Doc (readme.io) | Notes |
|-----------|------------------|-----------------|-------|
| `verifyCredentials` | `getApiUserPermissions` | Search readme for method | Settings “Test connection” |
| `createCharge` (hosted) | `createPaymentProcess` | [create payment process](https://grow-il.readme.io/reference/createpaymentprocess) | Returns `authCode` / page URL |
| `chargeWithToken` | `createTransactionWithToken` | Search readme | Renewals (`G6`) |
| Post-notify ack | `approveTransaction` | Search readme | **Mandatory** after successful notify |
| `refundCharge` | `refundTransaction` | Search readme | Same-day vs partial rules |
| Webhooks | *(incoming)* | Notify + invoice notify | Parsed in `parseGrowNotify` — not outbound REST |

**Credentials (manual today):**

| Tenant column | Grow field |
|---------------|------------|
| `payment_provider_account_id` | `userId` |
| `payment_provider_public_key` | `pageCode` |
| `payment_provider_secret_enc` | `apiKey` |

RPC: `save_tenant_grow_credentials`.

---

## G8-research focus (not in Light API today)

Light API assumes **existing** merchant credentials. **G8-research** must answer:

| Question | Where to look |
|----------|----------------|
| Partner / marketplace **create sub-merchant** API? | [grow.business](https://grow.business/api-developers/) (“multi-business”, marketplace); Grow sales / partner portal |
| Programmatic **payment page** creation? | readme.io + partner docs |
| **Webhook URL** registration via API? | readme.io; today configured in Grow dashboard |
| **SHAAM / Israel Invoice** connection | Grow dashboard only ([GROW-RUNBOOK §2](GROW-RUNBOOK.md)) — likely stays manual |

Deliverable: [G8-ADR.md](G8-ADR.md) (created by G8-research).

---

## Stage usage

| Stage | Use this doc |
|-------|----------------|
| **G8-research** | Catalog what exists vs onboarding gap; cite readme + partner sources |
| **G8-impl** | Only methods confirmed in G8-ADR |
| **G0–G7** | Already implemented — this doc is retrospective + research anchor |

---

## See also

- [stage-g8-silent-provisioning.md](stage-g8-silent-provisioning.md) — agent research brief  
- [icount/API-V3-REFERENCE.md](icount/API-V3-REFERENCE.md) — parallel for iCount REST  
- [icount/stage-i6-silent-provisioning.md](icount/stage-i6-silent-provisioning.md) — parallel provisioning track
