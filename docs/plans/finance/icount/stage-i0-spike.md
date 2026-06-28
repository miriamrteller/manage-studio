# Stage I0 — iCount API spike and architecture lock

**Goal:** Prove Option A (bundled iCount) against **real** iCount documentation and sandbox captures. Produce an approved [SPIKE-ADR.md](SPIKE-ADR.md). **No adapter code.**

**Blocks:** I1 and all later stages.

---

## Risks addressed

#3, #6, #7, #8, #17, #29 (+ Option A vs B/C gate)

---

## Scope IN

1. **SPIKE-ADR.md** — architecture decision + API Reference Catalog (#1–#11)
2. **Fixtures** under `apps/web/src/__tests__/fixtures/`:
   - Document webhook: official help example (committed)
   - IPN: official field catalog (committed) + **sandbox capture required** before I2
3. **Credential mapping** — tenant columns → iCount fields (in ADR)
4. **Go/no-go checklist** — each item cites catalog row
5. **Plan on disk** — this folder (`docs/plans/finance/icount/`)

---

## Scope OUT

- Any `icount.ts` adapter, registry, migration, UI
- Invented API endpoints or synthetic webhook bodies presented as captures
- Pre-filling catalog rows without doc URL or sandbox evidence

---

## Sandbox procedure (user + agent)

1. Enable **CC pages** module; create a dev pay page; note `cp` (page id).
2. Enable **WebHooks** module; point document webhook at a request bin or dev edge URL.
3. Enable **credit simulator** ([developers-credit-card-terminal](https://help.icount.co.il/credit-card-processing/developers-credit-card-terminal/)).
4. Create API token (Settings → API).
5. Run test payment via redirect URL with `m__tenant_id`, `m__payment_id`, `ipn_url`, `success_url`.
6. Capture raw **IPN POST** (headers + body) → save as `icount-ipn-notify.json`.
7. Capture **document webhook** from live account (compare to official example).
8. Probe API v3 authenticated modules for verify (#1), renewal charge (#3), refund (#4).

---

## Deliverables

| Deliverable | Path |
|-------------|------|
| SPIKE-ADR | [SPIKE-ADR.md](SPIKE-ADR.md) |
| Stage docs | `stage-i0-spike.md` … `stage-i5-defaults.md` |
| Overview | [00-overview.md](00-overview.md) |
| RUNBOOK skeleton | [RUNBOOK.md](RUNBOOK.md) |
| Document fixture | `apps/web/src/__tests__/fixtures/icount-document-webhook-official-example.json` |
| IPN field reference | `apps/web/src/__tests__/fixtures/icount-ipn-official-fields.json` |
| IPN sandbox capture | `apps/web/src/__tests__/fixtures/icount-ipn-notify.json` (**pending**) |

---

## DoD checklist

- [x] SPIKE-ADR drafted with Option A′ (CC page + IPN + document webhook)
- [x] API catalog rows cite official doc URLs
- [x] #3 tenant routing designed (`m__tenant_id`); verified in sandbox when capture lands
- [x] #7 post-payment ack = N/A documented
- [x] #8 webhook secret approach proposed
- [x] Document webhook fixture committed (official example)
- [x] IPN official field catalog committed (not a synthetic notify body)
- [ ] IPN sandbox capture committed (`icount-ipn-notify.json`) **← user action**
- [ ] Renewals/refunds catalog rows confirmed in sandbox **or** deferral signed off
- [ ] User approval row in SPIKE-ADR signed
- [x] No adapter code started

---

## Stop condition

Report DoD (pass/fail per row). **Do not start I1** until SPIKE-ADR is approved and IPN sandbox capture is committed (or user accepts documented deferrals).
