# Stage I2 — Payment adapter, webhooks (I2a mock + I2b live)

Split per **mock-first, account-last** track. Run **I2a** without an iCount account; run **I2b** only after [I0-live](stage-i0-live-spike.md).

---

## I2a — Mock backend (no account)

**Status:** Complete (2026-06-29).

**Prerequisite:** I1 complete.

### Scope IN

- `createCharge`: build redirect URL per SPIKE-ADR (help docs); **MockIcount** returns `mock.icount.local` with same query params
- Generalize `handle-invoice-event` for icount **document webhook** JSON array (official fixture)
- `applyBundledDocumentNotify` shared dispatch (Grow unchanged)
- Risk #22 fallback design in code (payment lookup) — unit test with mocks
- Deno Tax Delegation guard (#16)
- **Do not** implement live `constructEvent` / IPN parser
- **Do not** implement `verify-icount-credentials` live HTTP

### Scope OUT

Live IPN, verify edge fn, PDF handler (I4), frontend, I5

### TDD — provider isolation (write tests **first**)

Implement [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) **I2a-T1 … I2a-T5** before generalizing handlers:

- icount document fixture → icount parser only when `invoicing_provider=icount`
- Grow fixture on icount tenant → **must not** apply Grow notify
- Grow regression suite unchanged

**Error handling:** apply webhook rules from [ADAPTER-PATTERNS.md](ADAPTER-PATTERNS.md) (parse fail → 4xx, idempotent replay).

Suggested files: `handle-invoice-event-isolation.test.ts`, `icount-document-webhook-parse.test.ts`

### DoD (I2a)

- [x] Document webhook parse tests use `icount-document-webhook-official-example.json`
- [x] `handle-invoice-event` dispatches icount + Grow by slug
- [x] **I2a-T1 … I2a-T5** green
- [x] Mock payment + document path via `confirm-mock-payment` + mock invoice handler
- [x] Grow regression green
- [x] `pnpm -C apps/web test` green

**Stop after I2a:** Mock phase continues with I4 — see [00-overview.md](00-overview.md#mock-phase-milestone--complete). Live work waits for [I0-live](stage-i0-live-spike.md).

---

## I2b — Live backend (account required)

**Prerequisite:** I2a + [I0-live](stage-i0-live-spike.md) (SPIKE-ADR approved, `icount-ipn-notify.json` committed, [webhook security model](SPIKE-ADR.md#webhook-security-model) finalized).

### Scope IN

- `constructEvent`: parse **sandbox-captured** IPN only (#6, #29)
- Implement [SPIKE-ADR § Webhook security model](SPIKE-ADR.md#webhook-security-model) compensating controls
- `peekIcountTenantId` from captured fields (#3)
- `verify-icount-credentials` + `config.toml` (#1, #11 partial) — respect [rate limits](ADAPTER-PATTERNS.md)
- Initial card token save **if** IPN capture includes token (#21)
- RUNBOOK secrets draft (#26)
- Manual sandbox smoke (user-run)

### Scope OUT

I5, full I4 renewals/refunds (unless I0-live confirmed API)

### TDD — provider isolation (write tests **first**)

Implement [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) **I2b-T1 … I2b-T6** after `icount-ipn-notify.json` exists:

- Live IPN → icount tenant → icount `constructEvent` only
- Same IPN → grow tenant → **must fail** (no icount finalise)
- Grow notify → grow tenant → Grow path unchanged

Suggested files: `icount-ipn-parse.test.ts`, `icount-ipn-isolation.test.ts`, `payment-webhook-peek-isolation.test.ts`

### DoD (I2b)

- [ ] IPN parser matches `icount-ipn-notify.json` — no invented fields
- [ ] Webhook security controls from SPIKE-ADR implemented + tested
- [ ] **I2b-T1 … I2b-T6** green
- [ ] Outbound calls follow [ADAPTER-PATTERNS.md](ADAPTER-PATTERNS.md) retry/rate rules
- [ ] Every outbound `fetch` maps to SPIKE-ADR catalog row
- [ ] Manual sandbox: one CC page payment → IPN → finalise
- [ ] `pnpm -C apps/web test` green

**Stop:** Do not start I5 without Pre-I5 gate. I4 may proceed per deferral notes in SPIKE-ADR. **I6** may proceed in parallel if research complete.
