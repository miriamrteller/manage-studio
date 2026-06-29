# Stage I5 — Set iCount as IL default for new tenants

**Blocked until:** [Pre-I5 gate](00-overview.md#pre-i5-gate--integration-ready-before-default-slug-flip) + user approval.

**Does not require I6.** New IL tenants get `icount/icount` slug; **manual** iCount setup via I3 settings remains valid until [I6](stage-i6-silent-provisioning.md) ships.

**Requires iCount account** for final sandbox smoke (recommended before flip).

---

## Scope IN (only)

1. Migration: `provision_tenant()` IL → `icount/icount`
2. `seed-finance.sql`: primary tenant → icount mock; Grow block commented for regression
3. Finalize [RUNBOOK.md](RUNBOOK.md)
4. Link from finance overview

---

## Scope OUT

Auto-migrate Grow tenants; in-place shipped migration edits

---

## TDD — dual seed (write tests **before** migration + seed flip)

Per [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) **I5-T1 … I5-T3**:

1. **I5-T1/T2** — failing tests with icount primary seed + Grow regression block (both mocks `true`)
2. Apply migration + `seed-finance.sql` flip
3. **I5-T3** — re-run I1-T3/T4 in same CI env (no cross-wiring after default change)

---

## DoD

- [ ] Pre-I5 gate checklist passes
- [ ] **I5-T1 … I5-T3** green ([PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) — dual seed, both mocks in CI)
- [ ] Re-seed → creativeballet `icount/icount`
- [ ] Grow regression seed documented
- [ ] One live or simulator smoke after flip (user-run)

**Stop:** Integration epic milestone complete. **V1 complete** still requires [I6](stage-i6-silent-provisioning.md).
