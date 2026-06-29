# Stage I4 — Renewals, refunds, PDF retention (mirror G6)

**Mock phase:** ✅ Complete (I4-mock-parity + I4a). **Live phase:** pending I0-live.

**Prerequisite:** I2a minimum. **Live icount renewals/refunds require I0-live** unless SPIKE-ADR documents deferral.

**Related:** [stage-i4-mock-parity.md](stage-i4-mock-parity.md) · [stage-i4a-no-account.md](stage-i4a-no-account.md) · [00-overview.md](00-overview.md#deferred-i0-live-track-project-policy)

---

## I4a — No account ✅ Complete

**Implementation plan:** [stage-i4a-no-account.md](stage-i4a-no-account.md)

- Shared PDF retention via `fetchAndStoreBundledDocumentPdf` + `applyBundledDocumentNotify` — **done**
- Token invalidation on credential RPC slug change (#9) — **done**
- `RefundPaymentModal` bundled-provider copy (#14) — **done**

---

## I4-mock — Renewals & refund isolation ✅ Complete

**Implementation plan:** [stage-i4-mock-parity.md](stage-i4-mock-parity.md)

- Mock iCount enrolment via IPN; renewals via `chargeWithToken` + mock `cc/bill` + IPN delivery — **done**
- `run-monthly-billing` / `process-refund` dispatch by payment row slug — **done**
- **I4-T1 … I4-T8** green — **done**

---

## I4b — Live (account required — deferred)

| Feature | Blocker |
|---------|---------|
| Live `IcountPaymentProvider.chargeWithToken` | I0-live catalog row #3 + ADR outcome |
| Live `refundCharge` | I0-live catalog row #4 |
| Live `constructEvent` (production IPN) | I0-live capture + I2b |
| Deploy list finalization (#11) | I2b |

**If I0-live defers renewals/refunds:** document manual billing runbook; disable auto-renewal for `icount` tenants until API confirmed. **Grow renewal tests must stay green.** Forced outcomes: [SPIKE-ADR § Renewals decision](SPIKE-ADR.md#renewals-decision-i0-live).

**Error handling:** [ADAPTER-PATTERNS.md](ADAPTER-PATTERNS.md) for billing cron and refund paths.

---

## TDD — provider isolation

**Mock phase (done):** `provider-isolation-renewal-refund.test.ts`, `icount-ipn-parse.test.ts`, `icount-mock-renewal-flow.test.ts`, `bundled-document-pdf.test.ts`, `icount-document-pdf-retention.test.ts`

**Live phase (after I0-live):** LIVE-T*, I2b-T*, live I4 adapter tests per [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md)

---

## DoD

### Mock phase ✅

- [x] PDF handler uses official `pdf_link` shape (fixture) — [stage-i4a-no-account.md](stage-i4a-no-account.md)
- [x] Grow renewal/refund regression green
- [x] **I4-T1 … I4-T8** green — [stage-i4-mock-parity.md](stage-i4-mock-parity.md)
- [x] **I4a-T1 … I4a-T4** green

### Live phase (pending I0-live)

- [ ] Live `chargeWithToken` / `refundCharge` per SPIKE-ADR outcome
- [ ] **I2b-T1 … I2b-T6** green
- [ ] Manual sandbox smoke documented in RUNBOOK

**Stop:** Do not start I5 without I0-live + Pre-I5 gate.
