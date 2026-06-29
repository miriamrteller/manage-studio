# iCount adapters — error handling, rate limits, ops

Shared patterns for **I2b**, **I4**, and **I6** implementers. Mirror existing Grow / invoicing conventions where noted.

---

## Error taxonomy

| Class | Retry? | User-visible? | Example |
|-------|--------|---------------|---------|
| **Config** | No | Admin settings banner | Missing `cp` / API token |
| **Provider 4xx** | No | Admin or payer message from provider body | Invalid token at `verifyCredentials` |
| **Provider 5xx / timeout** | Yes (bounded) | Generic “try again” | iCount API unavailable |
| **Webhook parse** | No (return 4xx) | No — ops alert | Wrong provider body on tenant |
| **Idempotency duplicate** | No | Success path (200, no double charge) | Same IPN replay |
| **Provisioning (I6)** | Partial | Operator wizard step error | Partner API rejected signup |

### Webhook handlers (`handle-payment-event`, `handle-invoice-event`)

- **Parse failure** → `400` + log; **never** call `finalisePayment` on partial parse.
- **Wrong tenant slug / provider** → `409` or `400` per [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md).
- **Duplicate success event** → idempotent 200; no duplicate payment row.
- **Transient DB error** → `500` so provider may retry (document expected replay behaviour in RUNBOOK).

### Outbound API (I2b, I4, I6)

- Use bounded retry with exponential backoff for **retryable** errors only (see `supabase/functions/_shared/invoicing/backoff.ts` pattern).
- **Non-retryable** provider errors → surface once; do not loop cron jobs.
- **No silent swallow** — log provider slug + tenant id + catalog row #.

### Provisioning (I6)

- On partial failure: tenant keeps **`icount/icount` slug** but **`icount_setup_status`** (or equivalent) = `manual_required`; show admin banner + link to manual [IcountSettingsForm](stage-i3-frontend.md).
- Never leave tenant on wrong payment slug after failed silent signup.

---

## Rate limits & circuit breakers

**Source of truth:** numbers come from **I0-live** authenticated API probe — do not invent limits (#29).

Until I0-live completes, use **conservative defaults** for outbound calls:

| Control | Default (pre-I0-live) | After I0-live |
|---------|----------------------|---------------|
| Per-tenant verify | Max 1 concurrent; 429 → backoff 60s | Update from probe |
| Renewal cron | Serial per tenant; stop batch on 3 consecutive 5xx | Per ADR row #3 |
| Provisioning (I6) | Max 1 attempt per tenant; no auto-retry without operator | Per partner API docs |

**RUNBOOK procedure (I0-live):**

1. Probe API v3 with token; record rate-limit headers or documented QPS if present.
2. Update [SPIKE-ADR.md](SPIKE-ADR.md) catalog footnote + this table.
3. If no published limits → document **manual throttle** (e.g. 2 req/s platform-wide) and monitor 429 responses.

---

## Credential rotation

| Secret | Procedure |
|--------|-----------|
| **API token** | Operator rotates in iCount UI → re-save via `save_tenant_icount_credentials` (I3 settings) |
| **Webhook secret** | `save_icount_webhook_secret`; optional overlap if iCount sends both old/new (verify at I0-live) |
| **CC page (`cp`)** | Create new page in iCount → update `p_page_id` in credential RPC; update redirect URLs |

No automatic rotation in V1 — document-only until I6 platform credentials exist.

---

## Monitoring (V1 minimum)

Alert or weekly review (manual OK for V1):

- Spike in `handle-payment-event` **5xx** for icount tenants
- `finalise-payment` failures after IPN 200
- I6 provisioning jobs stuck in `manual_required` > 24h

Full dashboards deferred post-V1; log lines must include `tenant_id`, `payment_provider`, catalog row #.

---

## Cross-references

- Webhook security compensating controls: [SPIKE-ADR.md](SPIKE-ADR.md) § Webhook security model
- Renewals go/no-go: [SPIKE-ADR.md](SPIKE-ADR.md) § Renewals decision
- Isolation TDD: [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md)
