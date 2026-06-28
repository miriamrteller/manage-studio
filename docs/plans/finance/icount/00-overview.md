# iCount extension — Overview (I0–I5)

Add **iCount** as a bundled payment + invoice provider and set it as the **default for new IL tenants**. **Grow is not removed** — existing Grow tenants, adapters, RPCs, and UI stay supported.

**Read before any stage:** this file → active `stage-iN-*.md` → [SPIKE-ADR.md](SPIKE-ADR.md) (after I0) → `.instructions.md` → [../AGENT-RUNBOOK.md](../AGENT-RUNBOOK.md) (Grow patterns).

---

## Stages

| Stage | Focus | Doc |
|-------|-------|-----|
| **I0** | API spike, SPIKE-ADR, fixtures (**blocking**) | [stage-i0-spike.md](stage-i0-spike.md) |
| I1 | Registry, mock, credential RPC | [stage-i1-registry.md](stage-i1-registry.md) |
| I2 | Payment adapter, IPN + document webhooks | [stage-i2-backend.md](stage-i2-backend.md) |
| I3 | UI — fix IL≠Grow trap, icount settings/checkout | [stage-i3-frontend.md](stage-i3-frontend.md) |
| I4 | Renewals, refunds, PDF retention | [stage-i4-parity.md](stage-i4-parity.md) |
| I5 | `provision_tenant` + seed default → icount | [stage-i5-defaults.md](stage-i5-defaults.md) |

**Operational:** [RUNBOOK.md](RUNBOOK.md)

---

## Scope principle — add, do not remove

| What changes | What stays |
|--------------|------------|
| New `icount` adapters + settings + checkout | All Grow code paths (`grow/grow`, GROW_MOCK) |
| IL default → `icount/icount` (**I5 only**) | Existing Grow tenants unchanged |
| `seed-finance.sql` primary tenant → icount (**I5**) | Grow regression block (commented) |

**Routing:** dispatch by `payment_provider` / `invoicing_provider` slug — **never** `country === 'IL'` alone.

---

## Tax & legal delegation

iCount owns all tax-document legality. OpalSwift orchestrates payments and stores `external_document_*` only. No local VAT math, document-type rules, or legal numbering. See `.instructions.md` §3.

---

## Official API only (#29)

Every adapter HTTP call must cite a row in [SPIKE-ADR.md](SPIKE-ADR.md) API Reference Catalog. Fixtures from official docs or sandbox captures — never invented payloads.

**I0 finding:** iCount hosted checkout uses **CC page redirect + IPN**, not Grow-style REST `createPaymentProcess`. See SPIKE-ADR Option A′.

---

## Risk register (index)

| # | Sev | Hole | Stage |
|---|-----|------|-------|
| 1–2 | Crit | IL=Grow UI traps | I3 |
| 3 | Crit | Webhook tenant routing | I0, I2 |
| 4 | Crit | Registry before DB slug | I1 |
| 29 | Crit | Invented API contracts | I0 catalog |

Full table: see Cursor plan archive or expand in SPIKE-ADR reviews.

### Pre-I5 gate

- icount UI + checkout work (`ICOUNT_MOCK`)
- Grow regression unchanged (`GROW_MOCK`)
- All I1–I4 DoD green
- Then only: provisioning migration + seed flip

---

## Cross-stage rules

- **One stage per agent session.** Stop after DoD; no chaining.
- **I0 blocks I1.** SPIKE-ADR approved + IPN sandbox capture (or documented deferral).
- **I1–I4:** dev seed stays `grow/grow`; icount slug only via mock/RPC tests.
- **Schema frozen.** RPC-only migrations.
- **No commit/push** unless user asks.
- Linked remote dev only (no local Supabase Docker).

---

## Epic Definition of Done

- [ ] SPIKE-ADR approved
- [ ] I1–I5 stage DoD checklists pass
- [ ] Pre-I5 gate passed
- [ ] Grow fully intact (tests + enrolment + renewals)
- [ ] New IL tenant + re-seed → `icount/icount`
- [ ] No local tax logic introduced
