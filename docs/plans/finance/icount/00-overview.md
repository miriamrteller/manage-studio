# iCount extension — Overview (I0–I6)

Add **iCount** as a bundled payment + invoice provider and set it as the **default for new IL tenants**. **Grow is not removed.**

**Read before any stage:** this file → active `stage-iN-*.md` → [SPIKE-ADR.md](SPIKE-ADR.md) → [API-V3-REFERENCE.md](API-V3-REFERENCE.md) → [GLOSSARY.md](GLOSSARY.md) → `.instructions.md`

---

## Dual tracks (integration vs provisioning)

Payment **integration** and **silent tenant signup** are separate. Neither blocks the other.

```text
MOCK PHASE (no account) — COMPLETE ✅
  I0-doc → I1 → I3 → I2a → I4-mock-parity → I4a

OTHER PROJECT WORK (your priority — iCount not blocking)

DEFERRED INTEGRATION WEEK (iCount sandbox account — end of project)
  I0-live → I2b → I4-live → I5

PROVISIONING (parallel — before V1 complete)
  I6-research ──→ I6-impl
```

| Track | Delivers | Blocks |
|-------|----------|--------|
| **Integration (mock)** | Checkout, webhooks, mocks, PDF, mock renewals/refunds | **Done** — see [mock-phase milestone](#mock-phase-milestone--complete) |
| **Integration (live)** | Sandbox capture, live IPN, live API, seed flip | I2b needs I0-live; I5 needs Pre-I5 gate |
| **Provisioning (I6)** | Silent iCount account for new IL tenants | **V1 complete** only — not mock phase |

Until **I6** ships, **manual credentials** via I3 `IcountSettingsForm` is the supported path (same pattern as Grow today). See [stage-i6-silent-provisioning.md](stage-i6-silent-provisioning.md).

---

## Deferred I0-live track (project policy)

**Policy:** Schedule **I0-live and everything after it at the end of the project**, after other implementation work finishes. Mock-first stages are complete; no iCount sandbox account is required until the deferred integration week.

| When | Stages | Account? |
|------|--------|----------|
| **Now (done)** | I0-doc, I1, I3, I2a, I4-mock-parity, I4a | No |
| **Parallel (optional)** | I6-research, G8-research | No |
| **Other project work** | Unrelated features — iCount mock path stays green in CI | No |
| **End — integration week** | [I0-live](stage-i0-live-spike.md) → I2b → I4-live → I5 | **Yes** |
| **V1 complete** | I6-impl (after I6-research sign-off) | Partner creds |

**Do not start I0-live until:** mock-phase milestone passes **and** iCount sandbox credentials are procured **and** you are ready for a focused capture/probe week.

**Safe to defer:** live `constructEvent`, live `verifyCredentials`, live `chargeWithToken`, live `refundCharge`, `icount-ipn-notify.json`, SPIKE-ADR live sign-off, I5 seed flip.

**Do not defer if you need:** production iCount payments — that requires the full live block above.

---

## Mock-first, account-last track

**Policy:** Do **not** require an iCount account until the project is almost finished. Build ~60–70% on mocks + **help center fixtures** + **API v3 plan mapping** ([API-V3-REFERENCE.md](API-V3-REFERENCE.md)); use the account for a focused **integration week** before I5.

| Phase | Account? | Status |
|-------|----------|--------|
| **I0-doc** | No | ✅ Complete |
| **I1** | No | ✅ Complete |
| **I3** | No | ✅ Complete |
| **I2a** | No | ✅ Complete |
| **I4-mock-parity** | No | ✅ Complete — [stage-i4-mock-parity.md](stage-i4-mock-parity.md) |
| **I4a** | No | ✅ Complete — [stage-i4a-no-account.md](stage-i4a-no-account.md) |
| **I0-live** | **Yes** | ⏸ Deferred — [stage-i0-live-spike.md](stage-i0-live-spike.md) |
| **I2b** | Yes | Pending I0-live |
| **I4-live** | Yes | Pending I0-live (renewals/refunds per ADR) |
| **I5** | Yes | Pending Pre-I5 gate |
| **I6-research** | No | Open — [stage-i6-silent-provisioning.md](stage-i6-silent-provisioning.md) |
| **I6-impl** | Partner creds | Pending I6-research |

**Parallel (optional):** [I6-research](stage-i6-silent-provisioning.md), [G8-research](../stage-g8-silent-provisioning.md) — docs only; do not block other work.

### Do not build before account (wasted rework)

- Production **IPN** `constructEvent` parser (needs `icount-ipn-notify.json`)
- **`verifyCredentials`** live HTTP
- **Renewal** `chargeWithToken` for icount (until I0-live decision)
- **Refund** adapter for icount (until I0-live decision)
- **I5** default flip (until Pre-I5 gate)

### Safe to build now (no account)

- ✅ Mock integration (I1, I2a, I3, I4-mock-parity, I4a) — **complete**
- I6-research, G8-research (docs)
- Other project features — keep `pnpm -C apps/web test` green with `GROW_MOCK` + `ICOUNT_MOCK`

---

## Mock-phase milestone — COMPLETE ✅

All no-account iCount integration work is shipped. Dev/CI uses `ICOUNT_MOCK=true` + manual credentials ([I3](stage-i3-frontend.md)).

- [x] I0-doc, I1, I3, I2a DoD green
- [x] I4-mock-parity DoD green ([stage-i4-mock-parity.md](stage-i4-mock-parity.md))
- [x] I4a DoD green ([stage-i4a-no-account.md](stage-i4a-no-account.md))
- [x] Provider isolation — mock phase: I1-T*, I2a-T*, I3-T*, I4-T*, I4a-T* ([PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md))
- [x] `ICOUNT_MOCK` enrolment → document webhook → PDF retention (mock)
- [x] Grow regression green in same CI run
- [x] Dev seed stays `grow/grow` until I5

**Next (when you choose):** other project work + optional I6-research. **Live block last:** I0-live → I2b → I4-live → I5 → I6-impl.

---

## Stages

| Stage | Focus | Account? | Doc |
|-------|-------|----------|-----|
| **I0-doc** | Docs + draft SPIKE-ADR | No | [stage-i0-spike.md](stage-i0-spike.md) ✅ |
| **I1** | Registry, mock, credential RPC | No | [stage-i1-registry.md](stage-i1-registry.md) ✅ |
| **I3** | UI routing + icount checkout | No | [stage-i3-frontend.md](stage-i3-frontend.md) ✅ |
| **I2a** | Mock backend (document webhook) | No | [stage-i2-backend.md](stage-i2-backend.md) ✅ |
| **I4-mock-parity** | Mock IPN / cc/bill renewals | No | [stage-i4-mock-parity.md](stage-i4-mock-parity.md) ✅ |
| **I4a** | PDF retention + refund UI | No | [stage-i4a-no-account.md](stage-i4a-no-account.md) ✅ |
| **I0-live** | Sandbox capture + ADR approval | **Yes** | [stage-i0-live-spike.md](stage-i0-live-spike.md) ⏸ |
| **I2b** | Live IPN + verify | Yes | [stage-i2-backend.md](stage-i2-backend.md) § I2b |
| **I4-live** | Live renewals/refunds | Yes | [stage-i4-parity.md](stage-i4-parity.md) § I4b |
| **I5** | Default slug + seed flip | Yes | [stage-i5-defaults.md](stage-i5-defaults.md) |
| **I6** | Silent iCount signup | Partner API | [stage-i6-silent-provisioning.md](stage-i6-silent-provisioning.md) |

**Reference:** [RUNBOOK.md](RUNBOOK.md) · [API-V3-REFERENCE.md](API-V3-REFERENCE.md) · [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) · [ADAPTER-PATTERNS.md](ADAPTER-PATTERNS.md) · [GLOSSARY.md](GLOSSARY.md)

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

**Mock phase:** I1-T*, I2a-T*, I3-T*, I4-T*, I4a-T* — **complete**. **Live phase:** LIVE-T*, I2b-T*, I5-T* — pending I0-live block.

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

Does **not** require I6. **Requires I0-live block complete.**

- [ ] I0-live complete + SPIKE-ADR live row signed
- [x] Mock paths documented in [RUNBOOK.md](RUNBOOK.md) Phase A
- [x] `ICOUNT_MOCK` enrolment green; Grow regression green
- [x] **Provider isolation (mock phase):** I1-T*, I2a-T*, I3-T*, I4-T*, I4a-T* pass
- [ ] **Provider isolation (live phase):** LIVE-T*, I2b-T*, remaining I4-live rows
- [x] I1–I4 **mock** DoD green
- [ ] I4 **live** renewals/refunds per [SPIKE-ADR renewals decision](SPIKE-ADR.md#renewals-decision-i0-live)
- [ ] [Webhook security model](SPIKE-ADR.md#webhook-security-model) enforced in I2b
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
- **I0-live blocks I2b** (not mock phase, not I6-research)
- **I0-live deferred until end of project** — see [Deferred I0-live track](#deferred-i0-live-track-project-policy)
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
