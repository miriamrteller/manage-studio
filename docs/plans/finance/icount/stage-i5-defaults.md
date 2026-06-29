# Stage I5 — Set iCount as IL default for new tenants

**Blocked until:** I0-live + SPIKE-ADR approved + Pre-I5 gate + user approval.

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

## DoD

- [ ] Pre-I5 gate checklist passes
- [ ] Re-seed → creativeballet `icount/icount`
- [ ] Grow regression seed documented
- [ ] One live or simulator smoke after flip (user-run)

**Stop:** Epic complete.
