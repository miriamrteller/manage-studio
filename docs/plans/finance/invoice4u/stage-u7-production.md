# Stage U7 — Production readiness

**Prerequisite:** U5 tenant on Invoice4U + U6 runbook. Prod Invoice4U account (separate from QA).

---

## Checklist

- [ ] Prod API key saved (not QA key)
- [ ] `IsQaMode` false in prod
- [ ] `INVOICE4U_API_BASE` / notify URL point at prod edge function HTTPS
- [ ] Clearing company matches prod terminal
- [ ] Tokenization + refunds confirmed with ₪1 test then refund
- [ ] Enrol happy path + document PDF link
- [ ] Renewal dry-run on next schedule (or forced cron in staging)
- [ ] Dunning still works on failed renewal
- [ ] Rollback plan: re-save Grow credentials if needed (tokens won’t transfer — document that)

---

## DoD

- [ ] Checklist signed off by user
- [ ] IMPLEMENTATION_STATUS / SPEC reflect Invoice4U as IL bundled target

**Stop.** Wrapper track complete.
