# Stage I3 — UI: IL routing trap + iCount paths (mirror G5/G7)

**Goal:** Slug-based bundled routing; icount settings + checkout shell. **Extend, don't delete Grow UI.**

## Scope IN

- `navigationConfig.ts` — remove `country === 'IL'` as Grow proxy; add `/admin/setup/icount`
- `TenantSettingsHub`, `TaxSettingsForm` — bundled-provider copy only (no tax logic)
- `EnrolmentPaymentForm` — `hostedPageReady` by slug, not `growReady`
- `EnrolmentCheckoutShells` — icount + `mock.icount.local`
- `IcountSettingsForm` per SPIKE-ADR credentials (#28)
- `FinanceHealthCard` — provider prop (#24)
- `invoiceDisplay.ts`, payments log i18n, e2e updates

## Prerequisite

Do not use icount slug on dev seed for UI enrolment until this stage completes.

## DoD

- [ ] IL tenant with `icount/icount` sees icount nav + checkout (`ICOUNT_MOCK`)
- [ ] Grow tenant unchanged
- [ ] axe/i18n clean

**Stop:** Do not start I4.
