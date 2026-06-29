# iCount — RUNBOOK (linked remote dev)

Mirror [../GROW-RUNBOOK.md](../GROW-RUNBOOK.md). See [00-overview.md](00-overview.md#mock-first-account-last-track) for when an account is needed.

---

## Phase A — Mock build (no account)

Use `ICOUNT_MOCK=true`. Dev seed stays `grow/grow` until I5.

- Enrolment + finance tests via `MockIcount` + `confirm-mock-payment`
- Document webhook tests via `icount-document-webhook-official-example.json`
- Configure icount tenant via `save_tenant_icount_credentials` RPC (not seed flip)

---

## Phase B — Sandbox setup (I0-live — account required)

Schedule near project end, before I2b / I5.

1. Enable modules: **CC pages**, **WebHooks**, **credit simulator** ([help](https://help.icount.co.il/credit-card-processing/developers-credit-card-terminal/)).
2. Create dev CC page → note page id (`cp`).
3. Settings → API → create token.
4. Configure document webhook URL → dev edge.
5. Configure page IPN URL → `handle-payment-event` URL.
6. Test redirect with `m__tenant_id`, `m__payment_id` ([create-cc-page](https://help.icount.co.il/credit-card-processing/create-cc-page/)).
7. Save raw IPN POST → `apps/web/src/__tests__/fixtures/icount-ipn-notify.json`.
8. Update [SPIKE-ADR.md](SPIKE-ADR.md) catalog + approval.

---

## Supabase secrets (linked remote)

| Secret | Purpose |
|--------|---------|
| `ICOUNT_MOCK` | `"true"` → MockIcount in CI/dev (Phase A) |
| `ICOUNT_API_BASE` | `https://api.icount.co.il/api/v3.php` (confirm at I0-live) |
| `ICOUNT_NOTIFY_URL` | IPN URL on CC page redirect (Phase B) |

---

## Dev re-seed (I5 only)

Primary tenant → `icount/icount`. Grow regression: uncomment block in `seed-finance.sql`.

---

## CC page redirect template

```
https://app.icount.co.il/m/{cp}?cs={amount}&cd={description}&success_url={url}&ipn_url={url}&m__tenant_id={uuid}&m__payment_id={uuid}
```

---

## Manual smoke

| Phase | Checklist |
|-------|-----------|
| A (mock) | `ICOUNT_MOCK` enrolment → finalise → document fields |
| B (live) | Real/simulator payment → IPN → finalise; document webhook |
| Always | Grow tenant regression (`GROW_MOCK`) |

---

## Deferred until I0-live (unless ADR says otherwise)

- [ ] `icount-ipn-notify.json`
- [ ] Renewal API (#3)
- [ ] Refund API (#4)
- [ ] Live SPIKE-ADR approval
