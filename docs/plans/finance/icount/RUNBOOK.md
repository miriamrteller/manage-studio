# iCount — RUNBOOK (linked remote dev)

Draft from I0/I2; finalize at I5. Mirror [../GROW-RUNBOOK.md](../GROW-RUNBOOK.md) patterns.

---

## Sandbox setup (I0)

1. Enable modules: **CC pages**, **WebHooks**, **credit simulator** ([help](https://help.icount.co.il/credit-card-processing/developers-credit-card-terminal/)).
2. Create dev CC page → note page id (`cp`).
3. Settings → API → create token.
4. Configure document webhook URL → dev edge or request bin.
5. Configure page IPN URL → payment webhook endpoint.
6. Test redirect with `m__tenant_id`, `m__payment_id` ([create-cc-page params](https://help.icount.co.il/credit-card-processing/create-cc-page/)).
7. Save raw IPN POST as `apps/web/src/__tests__/fixtures/icount-ipn-notify.json`.

---

## Supabase secrets (linked remote)

| Secret | Purpose |
|--------|---------|
| `ICOUNT_MOCK` | `"true"` → MockIcount in CI/dev |
| `ICOUNT_API_BASE` | Default `https://api.icount.co.il/api/v3.php` (confirm in SPIKE-ADR) |
| `ICOUNT_NOTIFY_URL` | IPN URL passed on CC page redirect |
| `ICOUNT_DOCUMENT_NOTIFY_URL` | If separate from IPN (usually document webhook in iCount UI) |

Reuse `app.encryption_key` for credential encryption.

---

## Dev re-seed (after I5)

```bash
pnpm db:sync
# seed.sql then seed-finance.sql per supabase/seed-finance.sql header
```

Primary tenant (`creativeballet`) → `icount/icount` + `ICOUNT_MOCK=true`.

### Grow regression

Uncomment Grow block in `seed-finance.sql` + `GROW_MOCK=true` — do not change primary seed.

---

## CC page redirect template (from SPIKE-ADR)

```
https://app.icount.co.il/m/{cp}?cs={amount}&cd={description}&success_url={url}&ipn_url={url}&m__tenant_id={uuid}&m__payment_id={uuid}
```

Amount/currency rules per iCount help — confirm in sandbox.

---

## Manual smoke checklist

- [ ] icount enrolment (mock then sandbox)
- [ ] IPN → payment finalised
- [ ] Document webhook → `external_document_*` set
- [ ] Grow tenant regression unchanged

---

## Open items (I0)

- [ ] `icount-ipn-notify.json` sandbox capture
- [ ] Renewal API (#3) — standing order / saved card API module
- [ ] Refund API (#4) — credit note path
- [ ] SPIKE-ADR user approval
