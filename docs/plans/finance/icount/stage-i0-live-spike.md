# Stage I0-live — Live integration spike (iCount account required)

**Goal:** Close SPIKE-ADR with **sandbox captures** and user approval. Schedule when the project is **almost finished** — not at epic start.

**Prerequisite:** I1 + I3 + **I2a** complete (mock path green in CI). iCount sandbox account procured.

**Blocks:** I2b (live IPN), I4 live renewals/refunds, **I5** (default flip).

---

## Risks addressed

#3 (tenant routing verified), #6 (live doc webhook optional), #8 (signature confirmed), catalog rows #1–#4, #6, #10

---

## Scope IN

1. **Sandbox setup** — [RUNBOOK.md](RUNBOOK.md) § Sandbox setup
2. **Capture raw IPN POST** → `apps/web/src/__tests__/fixtures/icount-ipn-notify.json` (headers + body; redacted)
3. **Optional:** live document webhook capture (compare to official example)
4. **Probe API v3** with account token:
   - `verifyCredentials` module (#1)
   - Renewal / saved-card charge (#3) — go/no-go for auto-billing
   - Refund / credit note (#4)
5. **Update SPIKE-ADR** catalog rows from **pending** → **complete** or **N/A / deferred**
6. **Sign SPIKE-ADR approval** row
7. **Document deferrals** if renewals/refunds have no API (manual runbook until later)

---

## Scope OUT

- Adapter implementation (that's I2b / I4)
- I5 provisioning/seed flip
- Inventing IPN payloads if capture fails — stop and reassess Option B/C

---

## DoD checklist

- [ ] `icount-ipn-notify.json` committed (real sandbox capture)
- [ ] `m__tenant_id` (or fallback strategy) verified in live IPN
- [ ] Webhook signature approach confirmed or documented as URL-only (#8)
- [ ] Catalog rows #1, #2, #6 updated with sandbox evidence
- [ ] Renewals (#3): API confirmed **or** explicit deferral signed in ADR
- [ ] Refunds (#4): API confirmed **or** explicit deferral signed in ADR
- [ ] SPIKE-ADR approval row signed
- [ ] One manual CC page payment smoke documented in RUNBOOK

---

## Stop condition

Report DoD. **Do not start I2b or I5** until SPIKE-ADR is approved and IPN fixture is committed.
