# Stage I1 — Registry, mock, credentials (mirror G3)

**Goal:** Plumb `icount` into both registries and tenant config. **No live iCount HTTP. No UI.**

**Prerequisite:** [I0-doc](stage-i0-spike.md) complete (SPIKE-ADR **draft** accepted — **not** I0-live, **not** IPN capture).

---

## Scope IN

- Add `"icount"` to `payments/registry.ts` and `invoicing/registry.ts` (#4)
- `IcountPaymentProvider` stub + `MockIcountPaymentProvider` (`mock.icount.local`, shapes from I0-doc fixtures)
- `IcountInvoicingProvider` stub (throws on `issueDocument` if bundled)
- `confirm-mock-payment`: `ICOUNT_MOCK=true` path (#5)
- Migration: `save_tenant_icount_credentials(...)` — atomic `icount/icount` (#10)
- Webhook secret RPC per SPIKE-ADR draft (#8)
- **Do not** change `seed-finance.sql`

---

## Scope OUT

Live iCount HTTP, IPN parser, frontend, I5 provisioning/seed

---

## Tests

- `icount-registry.test.ts`
- Mock factory: grow→MockGrow, icount→MockIcount (#20)
- `confirm-mock-payment` → `finalise-payment` (backend-only)

### TDD — provider isolation (write tests **first**)

Implement [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) **I1-T1 … I1-T10** before registry/RPC code:

- Dual mock env: both `GROW_MOCK` and `ICOUNT_MOCK` true — factory returns correct mock **per slug**
- `confirm-mock-payment` rejects cross-provider mock (icount tenant + only `GROW_MOCK`, etc.)
- `save_tenant_icount_credentials` sets `icount/icount` atomically; Grow RPC unchanged

Suggested files: `icount-registry.test.ts`, `provider-isolation-mock.test.ts`, `icount-credential-rpc.test.ts`

---

## DoD

- [ ] Registry before icount slug in DB (tests/RPC only until I5)
- [ ] `ICOUNT_MOCK` mock path works
- [ ] **I1-T1 … I1-T10** green
- [ ] Grow registry + mock tests still green
- [ ] `pnpm db:sync` + `pnpm db:types:all` + `pnpm db:types:email-dist`
- [ ] `pnpm -C apps/web test` green

**Stop:** Do not start I2a until I1 DoD passes. **I3 may start next** (does not require I2).
