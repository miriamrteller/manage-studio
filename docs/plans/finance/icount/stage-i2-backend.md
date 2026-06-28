# Stage I2 — Payment adapter, webhooks, documents (mirror G4)

**Goal:** CC page redirect + IPN parser + document webhook dispatch per SPIKE-ADR Option A′.

## Scope IN

- `IcountPaymentProvider`: `createCharge` (build redirect URL), `constructEvent` (IPN parse), no post-ack (#7 N/A)
- `peekIcountTenantId` — prefer `tenant_id` from IPN custom fields; SPIKE-ADR fallback (#22)
- Generalize `handle-invoice-event` for icount document webhook JSON array
- `verify-icount-credentials` edge fn + `config.toml`
- Deno Tax Delegation guard (`gaps.test.ts`) (#16)
- Initial card token save if IPN/sandbox exposes token (#21)
- Draft RUNBOOK secrets section (#26)

## Scope OUT

PDF handler (I4), frontend, renewals, provisioning/seed

## Tests

- `icount-webhook-parse.test.ts` with I0 fixtures
- Grow regression tests unchanged
- Idempotency + bundled skip ordering

## DoD

- [ ] Every outbound `fetch` maps to SPIKE-ADR catalog row
- [ ] `handle-invoice-event` dispatches icount + Grow
- [ ] Manual sandbox smoke (user-run)
- [ ] `pnpm -C apps/web test` green

**Stop:** Do not start I3.
