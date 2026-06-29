# Stage I2 — Payment adapter, webhooks (I2a mock + I2b live)

Split per **mock-first, account-last** track. Run **I2a** without an iCount account; run **I2b** only after [I0-live](stage-i0-live-spike.md).

---

## I2a — Mock backend (no account)

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

Suggested files: `handle-invoice-event-isolation.test.ts`, `icount-document-webhook-parse.test.ts`

### DoD (I2a)

- [ ] Document webhook parse tests use `icount-document-webhook-official-example.json`
- [ ] `handle-invoice-event` dispatches icount + Grow by slug
- [ ] **I2a-T1 … I2a-T5** green
- [ ] Mock payment + document path via `confirm-mock-payment` + mock invoice handler
- [ ] Grow regression green
- [ ] `pnpm -C apps/web test` green

**Stop after I2a:** Proceed to **I3** if not done, or pause until account for I0-live.

---

## I2b — Live backend (account required)

**Prerequisite:** I2a + [I0-live](stage-i0-live-spike.md) (SPIKE-ADR approved, `icount-ipn-notify.json` committed).

### Scope IN

- `constructEvent`: parse **sandbox-captured** IPN only (#6, #29)
- `peekIcountTenantId` from captured fields (#3)
- `verify-icount-credentials` + `config.toml` (#1, #11 partial)
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
- [ ] **I2b-T1 … I2b-T6** green
- [ ] Every outbound `fetch` maps to SPIKE-ADR catalog row
- [ ] Manual sandbox: one CC page payment → IPN → finalise
- [ ] `pnpm -C apps/web test` green

**Stop:** Do not start I5. I4 may proceed per deferral notes in SPIKE-ADR.
