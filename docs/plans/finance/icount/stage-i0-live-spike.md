# Stage I0-live — Live integration spike (iCount account required)

**Goal:** Close SPIKE-ADR with **sandbox captures** and user approval. Schedule when the project is **almost finished** — not at epic start.

**Prerequisite:** I1 + I3 + **I2a** complete (mock path green in CI). iCount sandbox account procured.

**Blocks:** I2b (live IPN), I4 live renewals/refunds, **I5** (default flip).

---

## Risks addressed

#3 (tenant routing verified), #6 (live doc webhook optional), #8 (signature confirmed), catalog rows #1–#4, #6, #10

---

## TDD — write tests immediately after capture

I0-live is **not** adapter code — it is fixture + contract tests that **block I2b**.

| Step | Action |
|------|--------|
| 1 | Capture sandbox IPN → `icount-ipn-notify.json` |
| 2 | Add skeleton parser test file (`icount-ipn-parse.test.ts`) — **LIVE-T1 … LIVE-T4** |
| 3 | Run tests: LIVE-T1 passes (file exists); T2–T4 may use stub parser until I2b |
| 4 | **LIVE-T3/T4 must fail** if Grow/icount parsers are wired without dispatch guards |
| 5 | Sign SPIKE-ADR only when LIVE-T* + catalog probes complete |

Full workflow: [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) § Post-account TDD workflow.

---

## Scope IN

1. **Sandbox setup** — [RUNBOOK.md](RUNBOOK.md) § Sandbox setup
2. **Capture raw IPN POST** → `apps/web/src/__tests__/fixtures/icount-ipn-notify.json` (headers + body; redacted)
3. **Optional:** live document webhook capture (compare to official example)
4. **Probe API v3** with account token:
   - `verifyCredentials` module (#1)
   - Renewal / saved-card charge (#3) — **sign outcome A/B/C** ([SPIKE-ADR § Renewals decision](SPIKE-ADR.md#renewals-decision-i0-live))
   - Refund / credit note (#4) — confirm or defer
   - **Rate limits** — record headers/docs; update [ADAPTER-PATTERNS.md](ADAPTER-PATTERNS.md)
5. **Webhook security** — confirm HMAC or update [SPIKE-ADR § Webhook security model](SPIKE-ADR.md#webhook-security-model) from capture
6. **Update SPIKE-ADR** catalog rows from **pending** → **complete** or **N/A / deferred**
7. **Sign SPIKE-ADR approval** row
8. **Document deferrals** if renewals/refunds have no API (manual runbook until later)

---

## Scope OUT

- Adapter implementation (that's I2b / I4)
- I5 provisioning/seed flip
- Inventing IPN payloads if capture fails — stop and reassess Option B/C

---

## DoD checklist

- [ ] `icount-ipn-notify.json` committed (real sandbox capture)
- [ ] **LIVE-T1 … LIVE-T4** green ([PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) — fixture contract before I2b parser)
- [ ] `m__tenant_id` (or fallback strategy) verified in live IPN
- [ ] Webhook security model confirmed or updated from capture ([SPIKE-ADR](SPIKE-ADR.md#webhook-security-model))
- [ ] Rate limits recorded ([ADAPTER-PATTERNS.md](ADAPTER-PATTERNS.md))
- [ ] Renewals (#3): **Outcome A, B, or C** signed
- [ ] Refunds (#4): confirmed **or** deferral signed
- [ ] Catalog rows #1, #2, #6 updated with sandbox evidence
- [ ] SPIKE-ADR live approval row signed
- [ ] One manual CC page payment smoke documented in RUNBOOK

---

## Stop condition

Report DoD. **Do not start I2b or I5** until SPIKE-ADR is approved and IPN fixture is committed.
