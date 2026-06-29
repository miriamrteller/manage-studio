# iCount extension — Overview (I0–I5)

Add **iCount** as a bundled payment + invoice provider and set it as the **default for new IL tenants**. **Grow is not removed.**

**Read before any stage:** this file → active `stage-iN-*.md` → [SPIKE-ADR.md](SPIKE-ADR.md) → `.instructions.md`

---

## Mock-first, account-last track

**Policy:** Do **not** require an iCount account until the project is almost finished. Build ~60–70% on mocks + official help docs; use the account for a focused **integration week** before I5.

### Execution order (recommended)

```text
I0-doc ✅  →  I1  →  I3  →  I2a  →  [ acquire account ]  →  I0-live  →  I2b  →  I4*  →  I5
```

| Phase | Account? | What you get |
|-------|----------|--------------|
| **I0-doc** | No | SPIKE-ADR draft, official fixtures — **done** |
| **I1** | No | Registry, MockIcount, credential RPC, `ICOUNT_MOCK` confirm path |
| **I3** | No | IL≠Grow fix, icount settings + checkout UI (mock) |
| **I2a** | No | Document webhook parser, redirect URL builder, mock backend parity |
| **I0-live** | **Yes** | IPN capture, API probe, SPIKE-ADR approval |
| **I2b** | Yes | Live IPN parser, `verify-credentials`, sandbox smoke |
| **I4** | Partial | PDF handler (fixture OK); **renewals/refunds defer** until I0-live confirms API |
| **I5** | Yes | `provision_tenant` + seed default flip |

\* I4 mock/PDF work can ship in I2a; icount **renewals/refunds** wait for I0-live unless ADR defers.

### Do not build before account (wasted rework)

- Production **IPN** `constructEvent` parser (needs `icount-ipn-notify.json`)
- **`verifyCredentials`** live HTTP
- **Renewal** `chargeWithToken` for icount
- **Refund** adapter for icount
- **I5** default flip

### Safe to build now (no account)

- I1, I3, I2a (see stage docs)
- CI: full mock enrolment → `finalise-payment` → bundled document fields
- Grow regression (always)

---

## Stages

| Stage | Focus | Account? | Doc |
|-------|-------|----------|-----|
| **I0-doc** | Docs + draft SPIKE-ADR | No | [stage-i0-spike.md](stage-i0-spike.md) ✅ |
| **I0-live** | Sandbox capture + ADR approval | **Yes** | [stage-i0-live-spike.md](stage-i0-live-spike.md) |
| I1 | Registry, mock, credential RPC | No | [stage-i1-registry.md](stage-i1-registry.md) |
| I2a / I2b | Mock backend → live IPN | a=no, b=yes | [stage-i2-backend.md](stage-i2-backend.md) |
| I3 | UI routing + icount checkout | No | [stage-i3-frontend.md](stage-i3-frontend.md) |
| I4 | Renewals, refunds, PDF | Partial | [stage-i4-parity.md](stage-i4-parity.md) |
| I5 | Provisioning + seed default | Yes | [stage-i5-defaults.md](stage-i5-defaults.md) |

**Operational:** [RUNBOOK.md](RUNBOOK.md) · **Isolation TDD:** [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md)

---

## Provider isolation (Grow vs iCount)

Both wrappers live in one codebase. A tenant must **never** use the wrong provider’s adapter, parser, credentials, or UI.

| Rule | Detail |
|------|--------|
| Dispatch by **slug** | `payment_provider` / `invoicing_provider` on `tenants` — not `country === 'IL'` |
| Factory | `getPaymentProviderForTenant(tenantId)` after resolving tenant from webhook metadata |
| Webhooks | Payment + document handlers **dispatch parser by tenant slug** (I2a/I2b) |
| Mocks | `GROW_MOCK` + `ICOUNT_MOCK` may both be `true`; mock chosen **per slug** |
| TDD | Failing isolation test **first** — see [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) |

**Mock phase (no account):** I1-T*, I2a-T*, I3-T* in isolation doc.  
**Live phase (after account):** LIVE-T*, I2b-T*, I4-T*, I5-T* in isolation doc.

---

## Scope principle — add, do not remove

| What changes | What stays |
|--------------|------------|
| New `icount` adapters + settings + checkout | All Grow paths (`grow/grow`, `GROW_MOCK`) |
| IL default → `icount/icount` (**I5 only**) | Existing Grow tenants unchanged |
| `seed-finance.sql` flip (**I5**) | Grow regression block (commented) |

**Routing:** by `payment_provider` / `invoicing_provider` slug — **never** `country === 'IL'` alone.

---

## Tax & legal delegation

iCount owns tax-document legality. OpalSwift stores `external_document_*` only. See `.instructions.md` §3.

---

## Official API only (#29)

Adapter HTTP calls cite [SPIKE-ADR.md](SPIKE-ADR.md) catalog. **No invented IPN bodies.** Mock shapes from I0-doc fixtures; live parsers from I0-live capture.

**Architecture (I0-doc):** CC page redirect + IPN + document webhook — not Grow REST.

---

## Pre-I5 gate (unchanged — before default flip)

- [ ] I0-live complete + SPIKE-ADR approved
- [ ] Mock + live smoke paths documented
- [ ] `ICOUNT_MOCK` enrolment green; Grow regression green
- [ ] **Provider isolation:** all applicable tests in [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) pass (mock + live sections)
- [ ] I1–I4 DoD green (with documented I4 deferrals if any)

---

## Cross-stage rules

- One stage per agent session; stop after DoD
- **TDD:** write failing tests from [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) before implementation (each stage section)
- **I0-doc does not block I1/I3/I2a**
- **I0-live blocks I2b and I5**
- I1–I4: dev seed stays `grow/grow` until I5
- No commit/push unless user asks

---

## Epic Definition of Done

- [ ] I0-live + SPIKE-ADR approved
- [ ] I1–I5 DoD (I4 deferrals documented if needed)
- [ ] **Provider isolation TDD** — mock + live test tables complete in [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md)
- [ ] Pre-I5 gate passed
- [ ] Grow fully intact
- [ ] New IL tenant + re-seed → `icount/icount`
