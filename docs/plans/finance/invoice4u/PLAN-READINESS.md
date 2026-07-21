# Invoice4U plan readiness (second audit — 2026-07-20)

## Verdict

| Question | Answer |
|----------|--------|
| Ready to start **U1 mock coding**? | **Yes** — after locking D5/D12/D15–D19 below |
| **100% ready / industry-complete** for production? | **No** — cannot be, until U0-live fixtures confirm callback/auth/PDF shapes |
| Fit for a 2‑month runway? | **Yes** |

Honest bar: a payment plan is “industry-standard” only when **identity, authenticity, amounts, idempotency, and refund keys** are locked — not when stages are merely listed. This pass locks those decisions provisionally; U0-live must confirm, not invent them.

---

## Industry-standard checklist

| Practice | Plan status |
|----------|-------------|
| Hosted fields / no PAN in our systems | ✅ Hosted `ClearingRedirectUrl` |
| Fulfil only on server callback, never ReturnUrl | ✅ Documented |
| Idempotent webhook handling | ✅ Replay via `provider_payment_ref` + finalise |
| Correlate checkout → callback with our order id | ✅ `OrderIdClientUsage` |
| Persist PSP charge id for refunds | ✅ D12 locked (PaymentId) |
| Round-trip / recover charge context (tenant, engagement, amounts) | ✅ D5+D15 locked (pending payment row) |
| Verify callback authenticity | ✅ D16 minimum + recommended clearing-log check |
| Verify amount against expected | ✅ D17 |
| Separate QA vs prod credentials / `IsQaMode` | ✅ |
| Fail closed on API `Errors[]` (HTTP 200 trap) | ✅ D8 |
| App-owned recurring + dunning (not PSP standing order) | ✅ D2 |
| Mock-first + live spike before prod | ✅ Stages |
| Secrets encrypted at rest, not in client | ✅ Credential RPC |
| Explicit go-live checklist | ✅ U7 |

Still **U0-live gated** (cannot pre-claim): exact form encoding, PDF cipher URL format, refund same-day rules, whether clearing-log verify API is fast enough for sync webhook path.

---

## What “not 100%” means

Do **not** treat the plan as finished product design until:

1. QA callback fixture committed  
2. ADR open questions checked off  
3. U4-live refund+credit proven  
4. U7 prod checklist signed  

Until then: **implementation-ready**, not **production-certified**.
