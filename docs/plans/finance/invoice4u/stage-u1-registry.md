# Stage U1 — Registry, mock, credentials

**Goal:** Plumb `invoice4u` into payment + invoicing registries. Mock adapter + credential RPC. **No live HTTP. No UI.**

**Prerequisite:** [00-overview.md](00-overview.md) + [SPIKE-ADR.md](SPIKE-ADR.md) draft accepted.

---

## Scope IN

- Add `"invoice4u"` to `payments/registry.ts` and `invoicing/registry.ts`
- `Invoice4uPaymentProvider` stub (live methods throw “not implemented — U2b”)
- `MockInvoice4uPaymentProvider` — hosted `pageUrl` on `mock.invoice4u.local`, `pendingWebhook: true`; token path `emitSyncEvent`
- `Invoice4uInvoicingProvider` stub — `issueDocument` throws non-retryable (bundled)
- Factory: `INVOICE4U_MOCK=true` → mock; else stub/live provider
- `confirm-mock-payment` + `mock-confirm-eligibility`: add `invoice4u` + `INVOICE4U_MOCK` (mirror grow/icount)
- Stub edge function `verify-invoice4u-credentials` (mock → valid; live body deferred to U2b) so U3 can ship
- Migration: `save_tenant_invoice4u_credentials(p_api_key, p_clearing_company_type, p_account_label default null)`  
  - Sets `payment_provider` + `invoicing_provider` = `invoice4u` atomically  
  - Encrypts API key → `payment_provider_secret_enc`; clearing company → `payment_provider_public_key` (ADR D4)  
  - Revoke non-invoice4u `payment_method_tokens`
- **Do not** change default seed / provision_tenant yet (U5)

---

## Scope OUT

Live Invoice4U HTTP, callback parser, frontend settings, U5 defaults

---

## Tests (write first where practical)

- Registry returns invoice4u mock when env set
- Dual/triple mock env: grow / icount / invoice4u factories isolate by slug
- `save_tenant_invoice4u_credentials` atomic slugs
- Grow + iCount existing registry tests still green

---

## DoD

- [ ] Slug registered both factories
- [ ] `INVOICE4U_MOCK` mock path works via confirm-mock-payment → finalise
- [ ] `mock-confirm-eligibility` accepts invoice4u
- [ ] `verify-invoice4u-credentials` stub exists
- [ ] Credential RPC migration applied (`pnpm db:sync` after user OK)
- [ ] Isolation tests green (triple mock env grow/icount/invoice4u)
- [ ] `pnpm -C apps/web test` green

**Stop.** Next: U3 or U2a — **but lock ADR D5 + D12 before U2a coding.**
