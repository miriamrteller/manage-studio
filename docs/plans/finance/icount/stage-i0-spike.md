# Stage I0-doc — Documentation spike (no iCount account)

**Goal:** Lock architecture from **official iCount help docs only**. Produce draft [SPIKE-ADR.md](SPIKE-ADR.md) + fixtures. **No adapter code. No sandbox account required.**

**Status:** Complete (2026-06-28). **API v3 mapping** added 2026-06-29 → [API-V3-REFERENCE.md](API-V3-REFERENCE.md).

---

## Risks addressed

#6 (document webhook shape), #7 (post-ack N/A), #8 (proposed), #17, #29 (partial — catalog from docs)

---

## Scope IN

1. **SPIKE-ADR.md** — Option A′ (CC page redirect + IPN + document webhook) + API catalog (help + apiv3)
2. **API-V3-REFERENCE.md** — REST module mapping from [apiv3.icount.co.il](https://apiv3.icount.co.il/) + snapshot fixture
3. **Fixtures** from official sources only:
   - `icount-document-webhook-official-example.json`
   - `icount-ipn-official-fields.json` (field catalog — **not** a notify body)
   - `apiv3-module-index.json` (apiv3 sidebar snapshot)
4. **Plan on disk** — `docs/plans/finance/icount/`
5. **Mock-first track** documented in [00-overview.md](00-overview.md)

---

## Scope OUT

- Live sandbox captures (`icount-ipn-notify.json`) → [stage-i0-live-spike.md](stage-i0-live-spike.md)
- Any adapter, registry, migration, UI code
- Invented IPN POST bodies

---

## DoD checklist

- [x] SPIKE-ADR drafted (Option A′)
- [x] API catalog rows cite help + apiv3 URLs
- [x] [API-V3-REFERENCE.md](API-V3-REFERENCE.md) + module index snapshot
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
| **I1** | **No** — ✅ done |
| **I3** | **No** — **next** |
| **I2a** (mock backend) | **No** — after I3 (or parallel if I3 done) |
| **I6-research** | **No** — parallel ([stage-i6-silent-provisioning.md](stage-i6-silent-provisioning.md)) |
| **I0-live** | N/A — separate stage; needs iCount account |
| **I2b** (live IPN) | **Yes** — needs I0-live |
| **I5** | **Yes** — needs Pre-I5 gate (not I6) |
| **V1 complete** | **Yes** — needs I6-impl |

---

## Stop condition

I0-doc is **done**. I1 is **done**. Next: **I3** (integration) and/or **I6-research** (parallel). Do **not** wait for an iCount account.
