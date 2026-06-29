# Stage I3 — UI: IL routing trap + iCount paths (mirror G5/G7)

**Goal:** Slug-based bundled routing; icount settings + checkout shell with **`ICOUNT_MOCK`**. **Extend, don't delete Grow UI.**

**Prerequisite:** I1 complete. **Does not require I2** (mock checkout uses `confirm-mock-payment` from I1).

---

## Scope IN

- `navigationConfig.ts` — remove `country === 'IL'` as Grow proxy; add `/admin/setup/icount`
- `TenantSettingsHub`, `TaxSettingsForm` — bundled-provider copy only
- `EnrolmentPaymentForm` — `hostedPageReady` by slug, not `growReady`
- `EnrolmentCheckoutShells` — icount + `mock.icount.local`
- `IcountSettingsForm` per SPIKE-ADR draft credentials (#28)
- `FinanceHealthCard` — provider prop; live verify waits for I2b (#24)
- `invoiceDisplay.ts`, payments log i18n, e2e updates

---

## Prerequisite (seed)

Do not flip dev seed to `icount/icount` until I5. For UI testing: RPC `save_tenant_icount_credentials` on a test tenant **or** temporary slug in tests only.

---

## TDD — provider isolation (write tests **first**)

Implement [PROVIDER-ISOLATION-TDD.md](PROVIDER-ISOLATION-TDD.md) **I3-T1 … I3-T6** before UI changes:

- IL + `icount` slug must not use Grow nav / `growReady` / Grow checkout shell
- Mismatched payment/invoicing slugs → bundled helper false

Suggested files: extend `navigation-config.test.ts`, `enrolment-provider-routing.test.ts`, `bundled-provider-slug.test.ts`

---

## DoD

- [ ] Tenant with `icount/icount` + `ICOUNT_MOCK` sees icount nav + mock checkout
- [ ] Grow tenant unchanged
- [ ] **I3-T1 … I3-T6** green
- [ ] axe/i18n clean
- [ ] `pnpm -C apps/web test` green

**Stop:** I4 or I2a next (either order OK). Do not start I5.
