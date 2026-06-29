# iCount extension — Overview (I0–I6)

Add **iCount** as a bundled payment + invoice provider and set it as the **default for new IL tenants**. **Grow is not removed.**

**Read before any stage:** this file → active `stage-iN-*.md` → [SPIKE-ADR.md](SPIKE-ADR.md) → [GLOSSARY.md](GLOSSARY.md) → `.instructions.md`

---

## Dual tracks (integration vs provisioning)

Payment **integration** and **silent tenant signup** are separate. Neither blocks the other.

```text
INTEGRATION (sequential):
  I0-doc ✅ → I1 ✅ → I3 → I2a → [account] → I0-live → I2b → I4* → I5

PROVISIONING (parallel — before V1 complete):
  I6-research (now) ──→ I6-impl
```

| Track | Delivers | Blocks |
|-------|----------|--------|
| **Integration** | Checkout, webhooks, mocks, live IPN, seed default slug | I2b needs I0-live; I5 needs Pre-I5 gate |
| **Provisioning (I6)** | Silent iCount account for new IL tenants | **V1 complete** only — not I3/I2a/I2b |

Until **I6** ships, **manual credentials** via I3 `IcountSettingsForm` is the supported path (same pattern as Grow today). See [stage-i6-silent-provisioning.md](stage-i6-silent-provisioning.md).

---

## Mock-first, account-last track

**Policy:** Do **not** require an iCount account until the project is almost finished. Build ~60–70% on mocks + official help docs; use the account for a focused **integration week** before I5.

| Phase | Account? | What you get |
|-------|----------|--------------|
| **I0-doc** | No | SPIKE-ADR draft, official fixtures — **done** |
| **I1** | No | Registry, MockIcount, credential RPC — **done** |
| **I3** | No | IL≠Grow fix, icount settings + checkout UI (mock); **manual credentials OK** |
| **I2a** | No | Document webhook parser, redirect URL builder, mock backend parity |
| **I0-live** | **Yes** | IPN capture, API probe, renewals/refunds decision, rate limits |
| **I2b** | Yes | Live IPN parser, `verify-credentials`, sandbox smoke |
| **I4** | Partial | PDF (fixture OK); renewals/refunds per I0-live decision |
| **I5** | Yes | `provision_tenant` + seed default flip (**manual iCount setup still OK**) |
| **I6** | Partner creds | Silent signup — **required for V1 complete** |

\* I4 mock/PDF work can ship in I2a.

**Parallel now:** [I6-research](stage-i6-silent-provisioning.md) (partner API / OTP — docs only).

### Do not build before account (wasted rework)

- Production **IPN** `constructEvent` parser (needs `icount-ipn-notify.json`)
- **`verifyCredentials`** live HTTP
- **Renewal** `chargeWithToken` for icount (until I0-live decision)
- **Refund** adapter for icount (until I0-live decision)
- **I5** default flip (until Pre-I5 gate)

### Safe to build now (no account)

- I3, I2a, I6-research
- CI: mock enrolment → `finalise-payment` → bundled document fields
- Grow regression (always)

---

## Stages

| Stage | Focus | Account? | Doc |
|-------|-------|----------|-----|
| **I0-doc** | Docs + draft SPIKE-ADR | No | [stage-i0-spike.md](stage-i0-spike.md) ✅ |
| **I0-live** | Sandbox capture + ADR approval | **Yes** | [stage-i0-live-spike.md](stage-i0-live-spike.md) |
| **I1** | Registry, mock, credential RPC | No | [stage-i1-registry.md](stage-i1-registry.md) ✅ |
| I2a / I2b | Mock backend → live IPN | a=no, b=yes | [stage-i2-backend.md](stage-i2-backend.md) |
| I3 | UI routing + icount checkout | No | [stage-i3-frontend.md](stage-i3-frontend.md) |
| I4 | Renewals, refunds, PDF | Partial | [stage-i4-parity.md](stage-i4-parity.md) |
| I5 | Default slug + seed flip | Yes | [stage-i5-defaults.md](stage-i5-defaults.md) |
| **I6** | Silent iCount signup | Partner API | [stage-i6-silent-provisioning.md](stage-i6-silent-provisioning.md) |

**Reference:** [RUNBOOK.md](RUNBOOK.md) · [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) · [ADAPTER-PATTERNS.md](ADAPTER-PATTERNS.md) · [GLOSSARY.md](GLOSSARY.md)

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

**Mock phase:** I1-T*, I2a-T*, I3-T*. **Live phase:** LIVE-T*, I2b-T*, I4-T*, I5-T*.

---

## Scope principle — add, do not remove

| What changes | What stays |
|--------------|------------|
| New `icount` adapters + settings + checkout | All Grow paths (`grow/grow`, `GROW_MOCK`) |
| IL default → `icount/icount` (**I5**) | Existing Grow tenants unchanged |
| Silent signup (**I6**) | Manual settings form as fallback |
| `seed-finance.sql` flip (**I5**) | Grow regression block (commented) |

---

## Gates (two checklists)

### Pre-I5 gate — integration ready (before default slug flip)

Does **not** require I6.

- [ ] I0-live complete + SPIKE-ADR live row signed
- [ ] Mock + live smoke paths documented in RUNBOOK
- [ ] `ICOUNT_MOCK` enrolment green; Grow regression green
- [ ] **Provider isolation:** applicable [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) rows pass
- [ ] I1–I4 DoD green (I4 renewals/refunds per [SPIKE-ADR renewals decision](SPIKE-ADR.md#renewals-decision-i0-live))
- [ ] [Webhook security model](SPIKE-ADR.md#webhook-security-model) documented; enforced in I2b
- [ ] [Rate limits](ADAPTER-PATTERNS.md#rate-limits--circuit-breakers) recorded from I0-live or conservative defaults signed

### V1 complete gate — product ready

Requires Pre-I5 **plus**:

- [ ] **I6-impl** DoD ([stage-i6-silent-provisioning.md](stage-i6-silent-provisioning.md)) — silent signup for new IL tenants
- [ ] Operator can provision IL tenant without manual iCount paste (happy path)
- [ ] Manual fallback verified when silent signup fails
- [ ] Grow fully intact; new IL tenant + re-seed → `icount/icount`

**I5 may ship before I6** with manual credentials. **V1 is not complete until I6 passes.**

---

## Cross-stage rules

- One stage per agent session; stop after DoD
- **TDD:** write failing tests from [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) before implementation
- **I6-research** may run in parallel with I3/I2a — must not block them
- **I0-live blocks I2b** (not I3/I2a/I6-research)
- I1–I4: dev seed stays `grow/grow` until I5
- **Error handling:** [ADAPTER-PATTERNS.md](ADAPTER-PATTERNS.md) for I2b, I4, I6
- No commit/push unless user asks

---

## Epic Definition of Done

Split intentionally:

| Milestone | Criteria |
|-----------|----------|
| **Integration epic (I5)** | Pre-I5 gate + I1–I5 DoD |
| **V1 complete** | V1 complete gate + I6 |

- [ ] Integration track complete (Pre-I5 gate)
- [ ] V1 complete gate (I6 silent signup)
- [ ] Provider isolation TDD — mock + live tables complete
- [ ] Grow fully intact
