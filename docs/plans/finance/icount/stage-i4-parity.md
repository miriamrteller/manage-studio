# Stage I4 — Renewals, refunds, PDF retention (mirror G6)

**Prerequisite:** I2a minimum. **Live icount renewals/refunds require I0-live** unless SPIKE-ADR documents deferral.

---

## I4a — No account (can ship with I2a)

**Implementation plan:** [stage-i4a-no-account.md](stage-i4a-no-account.md)

- Generalize `handle-payment-document` for `pdf_link` from document webhook fixture (#6) — **done** ([stage-i4a-no-account.md](stage-i4a-no-account.md))
- Token invalidation on credential RPC slug change (#9) — **done**
- `RefundPaymentModal` generic bundled-provider copy (#14) — **done**

---

## I4b — Account required (or defer)

| Feature | Blocker |
|---------|---------|
| `run-monthly-billing` icount branch | I0-live catalog row #3 |
| `refundCharge` | I0-live catalog row #4 |
| Deploy list finalization (#11) | I2b |

**If I0-live defers renewals/refunds:** document manual billing runbook; disable auto-renewal for `icount` tenants until API confirmed. **Grow renewal tests must stay green.** Forced outcomes: [SPIKE-ADR § Renewals decision](SPIKE-ADR.md#renewals-decision-i0-live).

**Error handling:** [ADAPTER-PATTERNS.md](ADAPTER-PATTERNS.md) for billing cron and refund paths.

---

## TDD — provider isolation

**I4a (no account):** PDF handler tests — icount `pdf_link` fixture only; Grow PDF path regression.

**I4b (after I0-live):** Write **I4-T1 … I4-T5 failing first** — billing/refund use **payment row provider slug**, not hardcoded `grow`. If SPIKE-ADR defers icount renewals/refunds (#3/#4), tests still assert **no Grow HTTP on icount rows** and document manual path.

Suggested file: `provider-isolation-renewal-refund.test.ts`

See [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) § Post-account TDD workflow (steps 6–7).

---

## DoD

- [x] PDF handler uses official `pdf_link` shape (fixture)
- [ ] Grow renewal/refund regression green
- [ ] **I4-T1 … I4-T5** green (or deferrals documented — no grow/icount cross-charge)
- [x] **I4a-T1 … I4a-T4** green (PDF retention + refund UI — see [stage-i4a-no-account.md](stage-i4a-no-account.md))

**Stop:** Do not start I5 without I0-live + Pre-I5 gate.
