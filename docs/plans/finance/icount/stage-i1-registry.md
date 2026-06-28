# Stage I1 — Registry, mock, credentials (mirror G3)

**Goal:** Plumb `icount` into both registries and tenant config without live iCount HTTP or UI.

**Prerequisite:** Approved [SPIKE-ADR.md](SPIKE-ADR.md).

## Scope IN

- Add `"icount"` to `payments/registry.ts` and `invoicing/registry.ts` (#4)
- `IcountPaymentProvider` stub + `MockIcountPaymentProvider` (`mock.icount.local` pageUrl, shapes from I0 fixtures)
- `IcountInvoicingProvider` stub (throws on `issueDocument` if bundled)
- `confirm-mock-payment`: `ICOUNT_MOCK=true` path (#5)
- Migration: `save_tenant_icount_credentials(...)` — atomic `icount/icount` slugs (#10)
- Webhook secret RPC per SPIKE-ADR (#8) — `payment_provider_webhook_enc`, not `grow_webhook_secrets`
- **Do not** change `seed-finance.sql` yet

## Scope OUT

Live iCount HTTP, frontend, provisioning default, seed flip

## Tests

- `icount-registry.test.ts` (mirror grow-registry)
- Mock factory: grow→MockGrow, icount→MockIcount (#20)
- RPC atomic slug test

## DoD

- [ ] Registry before any icount slug in DB
- [ ] `confirm-mock-payment` icount path
- [ ] `pnpm db:sync` + `pnpm db:types:all` + `pnpm db:types:email-dist`
- [ ] `pnpm -C apps/web test` green

**Stop:** Do not start I2.
