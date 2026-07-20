# Stage U4-live — Live renewals + refunds

**Prerequisite:** U2b + U0-live ADR signed.

---

## Scope IN

- Live `ChargeWithToken` in renewal path (`run-monthly-billing`)
- Persist/refresh card meta from renewal response if provided
- Live `refundCharge`; surface provider errors (time windows, balance)
- Confirm auto InvoiceCredit appears; if not, implement fallback CreateDocument credit with `ApiIdentifier`
- Manual QA checklist in runbook (U6 draft section OK)

---

## DoD

- [ ] QA renewal succeeds without hosted page
- [ ] QA full refund + credit document on payment row / Invoice4U UI
- [ ] Failure paths (bad CustomerId → 304) mapped cleanly
- [ ] Tests for adapters (mocked HTTP) green

**Stop.** Next U5 only after product gate.
