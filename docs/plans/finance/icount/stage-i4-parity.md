# Stage I4 — Renewals, refunds, PDF retention (mirror G6)

**Goal:** Parity with Grow G6 where SPIKE-ADR catalog supports it.

## Scope IN

- `run-monthly-billing` — icount branch (or defer if catalog #3 blocked)
- `process-refund` — icount `refundCharge` per catalog #4
- Generalize `handle-payment-document` for `pdf_link` (#6)
- Token invalidation on credential RPC slug change (#9)
- `deploy:payment-functions` + full `config.toml` list (#11)
- `RefundPaymentModal` icount note (#14)

## Go/no-go

If SPIKE-ADR marked renewals blocked → disable auto-renewal for icount tenants until API found.

## DoD

- [ ] Grow renewal/refund regression green
- [ ] Catalog rows #3–#4 implemented or explicitly deferred in RUNBOOK

**Stop:** Do not start I5.
