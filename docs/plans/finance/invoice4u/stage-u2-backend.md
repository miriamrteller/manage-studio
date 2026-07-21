# Stage U2 — Backend (U2a mock / U2b live)

**Prerequisite:** U1 complete.  
**Split:** U2a (no account) then U2b (after U0-live).

---

## U2a — Mock callback + bundled document

**Prerequisite ADR:** D5 / D12 / D15–D19 locked (see SPIKE-ADR). Implement these shapes in mock so U2b does not rewrite.

### Scope IN

- Hosted `createCharge`: **INSERT pending payment** (`OrderIdClientUsage` as `provider_payment_ref`) before returning `pageUrl` (D5)
- `parseInvoice4uCallback` — form-urlencoded `Data=`
- `handle-payment-event`: form peek **before** JSON/Grow peek; load pending by order id
- Success path: amount verify (D17) → upgrade ref to `PaymentId` (D12) → finalise → `applyBundledDocumentNotify` (D3/D19)
- Failure path: D18
- Persist `payment_method_tokens.provider_token` = CustomerId
- Unit tests: pending insert, amount mismatch reject, finalise-then-doc, replay, failed callback

### Scope OUT

Real `ProcessApiRequestV2` HTTP, live verify

### DoD

- [ ] Pending payment created at mock/hosted createCharge
- [ ] Form callback upgrades pending → succeeded with PaymentId
- [ ] Amount mismatch does **not** finalise
- [ ] Document applied after upgrade; PDF URL field set when present
- [ ] Failure callback marks failed / no activation
- [ ] Replay safe
- [ ] Tests green

**Stop.** Do not start U2b until U0-live.

---

## U2b — Live client + verify

**Prerequisite:** [U0-live](stage-u0-live-spike.md) ADR open questions answered.

### Scope IN

- HTTP client: POST wrapped JSON; check `Errors`; QA/prod base from env + `IsQaMode`
- Live `createCharge`: `AddTokenAndCharge` + `IsDocCreate` + `CallBackUrl`/`ReturnUrl`/`OrderIdClientUsage`/`CreditCardCompanyType`
- Live `constructEvent` from real callback shape captured in U0-live
- `verify-invoice4u-credentials` edge function → `IsAuthenticated`
- Env: `INVOICE4U_API_BASE`, `INVOICE4U_NOTIFY_URL`

### Scope OUT

Renewals/refunds live (U4-live), UI (U3 if not done)

### DoD

- [ ] Sandbox hosted charge → callback → payment succeeded + document fields
- [ ] Verify credentials works from admin (after U3) or curl
- [ ] GROW/ICOUNT paths unchanged

**Stop.** Next U4-live (or finish U3/U4-mock if pending).
