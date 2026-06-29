# iCount — RUNBOOK (linked remote dev)

Mirror [../GROW-RUNBOOK.md](../GROW-RUNBOOK.md). See [00-overview.md](00-overview.md) for dual tracks and gates.

**Terminology:** [GLOSSARY.md](GLOSSARY.md) (`cp` = CC page id). **REST API:** [API-V3-REFERENCE.md](API-V3-REFERENCE.md). **Errors / rate limits:** [ADAPTER-PATTERNS.md](ADAPTER-PATTERNS.md).

---

## Phase A — Mock build (no account) ✅ Complete

Use `ICOUNT_MOCK=true`. Dev seed stays `grow/grow` until I5.

- [x] Enrolment + finance tests via `MockIcount` + `confirm-mock-payment` (IPN path)
- [x] Mock renewals via `chargeWithToken` + mock `cc/bill` + IPN delivery
- [x] Document webhook tests via `icount-document-webhook-official-example.json`
- [x] PDF retention via `fetchAndStoreBundledDocumentPdf` (I4a)
- [x] **Provider isolation TDD:** I1-T*, I2a-T*, I3-T*, I4-T*, I4a-T*
- [x] CI with **both** `GROW_MOCK=true` and `ICOUNT_MOCK=true`
- [x] **Tenant iCount setup:** manual via admin settings (I3) until [I6](stage-i6-silent-provisioning.md)

See [00-overview.md § Mock-phase milestone](00-overview.md#mock-phase-milestone--complete).

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
8. **API v3 probes** — per [API-V3-REFERENCE.md](API-V3-REFERENCE.md) § Catalog row mapping (#1, #3, #4, #10); record samples + rate limits.
9. **TDD:** add LIVE-T1 … LIVE-T4 tests (see [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) § Post-account TDD workflow).
10. Update [SPIKE-ADR.md](SPIKE-ADR.md) catalog + approval.
11. Implement I2b only after LIVE-T* + ADR sign-off; I2b-T1 … I2b-T6 before claiming I2b DoD.
12. **Rate limits:** record from API probe → [ADAPTER-PATTERNS.md](ADAPTER-PATTERNS.md).
13. **Renewals/refunds:** sign outcome A/B/C in [SPIKE-ADR](SPIKE-ADR.md#renewals-decision-i0-live).

---

## Credential rotation

See [ADAPTER-PATTERNS.md § Credential rotation](ADAPTER-PATTERNS.md#credential-rotation).

---

## Monitoring (V1 minimum)

See [ADAPTER-PATTERNS.md § Monitoring](ADAPTER-PATTERNS.md#monitoring-v1-minimum).

---

## Silent signup (I6)

Platform partner credentials (Supabase secrets — names TBD in I6-ADR). Until I6: operators use manual settings form per Phase A note.

---

## Supabase secrets (linked remote)

| Secret | Purpose |
|--------|---------|
| `ICOUNT_MOCK` | `"true"` → MockIcount in CI/dev (Phase A) |
| `ICOUNT_API_BASE` | `https://api.icount.co.il/api/v3.php` — see [API-V3-REFERENCE.md](API-V3-REFERENCE.md) |
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
| A (mock) | `ICOUNT_MOCK` enrolment → finalise → document fields; **I1/I2a/I3 isolation tests** |
| B (live) | Real/simulator payment → IPN → finalise; **I2b isolation tests**; Grow notify still grow-only |
| Always | Grow tenant regression (`GROW_MOCK`); dual-mock CI (both flags true) |

---

## Deferred until I0-live (unless ADR says otherwise)

- [ ] `icount-ipn-notify.json`
- [ ] Renewal API (#3)
- [ ] Refund API (#4)
- [ ] Live SPIKE-ADR approval
