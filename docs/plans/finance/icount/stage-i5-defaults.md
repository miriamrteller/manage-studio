# Stage I5 — Set iCount as IL default for new tenants

**Blocked until:** Pre-I5 gate + user approval.

## Scope IN (only)

1. Migration: `provision_tenant()` IL → `icount/icount`
2. `seed-finance.sql`: primary tenant → icount mock; Grow block commented for regression
3. Finalize [RUNBOOK.md](RUNBOOK.md) secrets + re-seed steps
4. Finance overview doc link

## Scope OUT

Auto-migrate Grow tenants; in-place edits to shipped migrations

## DoD

- [ ] Pre-I5 gate checklist passes
- [ ] Re-seed produces creativeballet as `icount/icount`
- [ ] Grow regression seed documented

**Stop:** Epic complete.
