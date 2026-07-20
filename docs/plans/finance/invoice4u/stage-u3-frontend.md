# Stage U3 — Frontend settings + checkout routing

**Goal:** Admin can select Invoice4U, save credentials, and checkout redirects to hosted page (mock or live).

**Prerequisite:** U1. Can parallel U2a.

---

## Scope IN

- `tenantProviderRouting.ts`: `BundledPaymentProviderSlug`, `isBundled`, `isHostedPageCheckoutReady`, `isMockHostedPaymentPage` — include `invoice4u` / `mock.invoice4u.local`
- `bundledProviderUi` / `BUNDLED_PAYMENT_PROVIDER_OPTIONS`: add Invoice4U
- `Invoice4uSettingsForm` + wire into `BundledPaymentsSettings`
  - API key (secret)
  - Clearing company select: UPay / Meshulam / YaadSarig / Cardcom
  - Save → `save_tenant_invoice4u_credentials`
  - Test connection → `verify-invoice4u-credentials` stub from U1
- `FinanceHealthCard`: provider union + `VERIFY_FN` map for invoice4u
- Hosted checkout shell: mock-host allowlist includes `mock.invoice4u.local` (today grow/icount only)
- i18n en/he strings for settings labels

---

## Scope OUT

Silent signup, standing orders UI, Bit/wallets

---

## DoD

- [ ] Admin can save invoice4u/invoice4u and see health
- [ ] Enrol checkout with mock returns pageUrl and completes via confirm-mock
- [ ] Grow/iCount settings still work
- [ ] `pnpm -C apps/web test` green

**Stop.**
