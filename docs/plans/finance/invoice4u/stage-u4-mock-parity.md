# Stage U4-mock — Renewals + refunds (mock)

**Prerequisite:** U1 + U2a (+ U3 preferred).

---

## Scope IN

- Mock `chargeWithToken` → sync success for renewals (`provider_token` = CustomerId)
- `RENEWAL_TOKEN_PROVIDERS` includes `invoice4u`
- **`renewal-billing.ts`:** explicit branch — `invoice4u` → `chargeWithToken` (not Grow’s `createCharge(savedToken)` default)
- Mock `refundCharge` uses stored PaymentId per ADR D12; credit fields optional in mock
- `process-refund` path works for invoice4u tenant in mock
- Isolation TDD: renewals/refunds do not cross providers
- Finance walkthrough / mock e2e tags updated if needed

---

## Scope OUT

Live ChargeWithToken / Refund HTTP

---

## DoD

- [ ] Mock monthly billing charges saved CustomerId token
- [ ] Mock refund updates payment + refund row
- [ ] Isolation tests green
- [ ] Grow + iCount mock regression green

**Stop.** Mock milestone complete when this + U1–U3–U2a DoD all pass.
