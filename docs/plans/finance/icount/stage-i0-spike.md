# Stage I0-doc — Documentation spike (no iCount account)

**Goal:** Lock architecture from **official iCount help docs only**. Produce draft [SPIKE-ADR.md](SPIKE-ADR.md) + fixtures. **No adapter code. No sandbox account required.**

**Status:** Complete (2026-06-28).

---

## Risks addressed

#6 (document webhook shape), #7 (post-ack N/A), #8 (proposed), #17, #29 (partial — catalog from docs)

---

## Scope IN

1. **SPIKE-ADR.md** — Option A′ (CC page redirect + IPN + document webhook) + API catalog from help center
2. **Fixtures** from official sources only:
   - `icount-document-webhook-official-example.json`
   - `icount-ipn-official-fields.json` (field catalog — **not** a notify body)
3. **Plan on disk** — `docs/plans/finance/icount/`
4. **Mock-first track** documented in [00-overview.md](00-overview.md)

---

## Scope OUT

- Live sandbox captures (`icount-ipn-notify.json`) → [stage-i0-live-spike.md](stage-i0-live-spike.md)
- Any adapter, registry, migration, UI code
- Invented IPN POST bodies

---

## DoD checklist

- [x] SPIKE-ADR drafted (Option A′)
- [x] API catalog rows cite official doc URLs
- [x] Document webhook fixture committed
- [x] IPN official field catalog committed
- [x] #7 post-payment ack = N/A
- [x] #8 webhook secret approach proposed
- [x] Plan files on disk
- [x] No adapter code started

---

## What this unblocks

| Stage | Blocked by I0-doc? |
|-------|-------------------|
| **I1** | **No** — proceed when user accepts draft architecture |
| **I3** | **No** — after I1 |
| **I2a** (mock backend) | **No** — after I1 (document webhook uses official fixture) |
| **I0-live** | N/A — separate stage; needs iCount account |
| **I2b** (live IPN) | **Yes** — needs I0-live |
| **I5** | **Yes** — needs I0-live + Pre-I5 gate |

---

## Stop condition

I0-doc is **done**. Next: **I1** (or user review of SPIKE-ADR draft). Do **not** wait for an iCount account.
