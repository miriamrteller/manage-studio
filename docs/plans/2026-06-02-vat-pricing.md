# VAT pricing consistency — implementation plan

**SPEC (normative):** §2.5.1–§2.5.3 in [SPEC.md](../../SPEC.md)  
**Status:** Implemented (2026-06-02) — run manual verify + `pnpm email:bundle` on deploy  
**Tracking:** [docs/IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md)

## Locked decisions

- `tenants.prices_include_vat BOOLEAN NOT NULL DEFAULT true`
- Inclusive default: seed offerings at ₪240 → customer pays ₪240 everywhere
- V1: tenant flag only; no per-offering inclusive/exclusive override
- V1 VAT rate: **`tenant.vat_rate` only** — ignore `offering.vat_rate` in Zod/schemas until DB column exists
- Single code path: `packages/shared/src/pricing.ts` → `resolveOfferingPrice()`
- Stripe `PaymentIntent.amount = totalMinor`; Morning/Green Invoice (V2) reads `payments` breakdown only

## Do not

- Re-add migration `20260526003000` (squashed into `001` + `015`)
- Use route `admin/setup/billing` for VAT settings (that route is **billing accounts**)
- Add VAT math in email templates, Morning adapter, or webhook beyond metadata
- Use `offering.vat_rate` in `resolveOfferingPrice()` until `offerings.vat_rate` column exists

---

## Phase 1 — Schema & seed ✅

| Item | Status |
| ---- | ------ |
| `20260526000100_tenants.sql` — `prices_include_vat` + comment | ✅ |
| `20260526001500_public_rpcs.sql` — `get_tenant_config_by_subdomain` returns column | ✅ |
| `supabase/seed.sql` — tenant INSERT/ON CONFLICT includes `prices_include_vat` | ✅ |
| `packages/shared/src/database.types.ts` — `pnpm db:types` after reset | ✅ (regen after local sync) |

---

## Phase 2 — Shared pricing module

| File | Action | Status |
| ---- | ------ | ------ |
| `packages/shared/src/pricing.ts` | **New:** `calculateVat`, `addVatToPretax`, `resolveOfferingPrice`, export `OfferingPriceBreakdown` type | ✅ |
| `packages/shared/src/index.ts` | `export * from './pricing.js'` | ✅ |
| `apps/web/src/features/enrolment/lib/computeClassTotal.ts` | Delegate to `resolveOfferingPrice`; keep export shape for callers | ✅ |
| `apps/web/src/features/enrolment/lib/pricing.test.ts` | Vitest: 1000 agorot @ 17%; 24000 inclusive; 24000 exclusive → 28080 | ✅ |

**`resolveOfferingPrice` return shape** (map to `ClassTotalBreakdown` in wrapper):

- `listMinor`, `chargeMinor`, `pretaxMinor`, `vatMinor`, `totalMinor` (= `chargeMinor`), `vatRate`, `mode: 'inclusive' | 'exclusive'`

---

## Phase 3 — Edge Functions

| File | Action | Status |
| ---- | ------ | ------ |
| `supabase/functions/create-checkout/index.ts` | `tenants` select: `vat_rate, prices_include_vat, currency`; import `resolveOfferingPrice` from `../_shared/email-dist/pricing.js`; `amount: totalMinor`; metadata includes `prices_include_vat` | ✅ |
| `supabase/functions/stripe-webhook/index.ts` | Confirm pretax/vat from metadata only (no `price_minor * 1.17` fallback when metadata present) | ✅ (unchanged; uses metadata) |
| `supabase/functions/create-payment-intent/index.ts` | Align with checkout or add deprecation comment (web does not call) | ⬜ legacy |

After Phase 2:

```bash
pnpm -C packages/shared build && pnpm email:bundle
```

---

## Phase 4 — Web UI

### Tenant config plumbing

| File | Action | Status |
| ---- | ------ | ------ |
| `packages/shared/src/schemas.ts` | `TenantSchema.prices_include_vat` (default `true`) | ✅ |
| `apps/web/src/types/auth.ts` | `TenantConfig.prices_include_vat: boolean` | ✅ |
| `apps/web/src/hooks/useTenant.ts` | Map `row.prices_include_vat` from RPC | ✅ |

### Tax settings (new route — not billing accounts)

| File | Action | Status |
| ---- | ------ | ------ |
| `apps/web/src/features/settings/components/TaxSettingsForm.tsx` | **New** — toggle `prices_include_vat`, edit `vat_rate` | ✅ |
| `apps/web/src/pages/TaxSettingsPage.tsx` | **New** — container | ✅ |
| `apps/web/src/router.tsx` | `{ path: "admin/setup/tax", element: <AdminRoute><TaxSettingsPage /></AdminRoute> }` | ✅ |
| `apps/web/src/components/Dashboard/AdminPanel.tsx` | Setup card → `/admin/setup/tax` | ✅ |
| Save pattern | `supabase.from('tenants').update({ prices_include_vat, vat_rate }).eq('id', tenant.id)` — RLS `admins update own tenant`; then `queryClient.invalidateQueries({ queryKey: ['tenant'] })` | ✅ |

**Do not** repurpose `BillingPage` (`/admin/setup/billing` = `billing_accounts`).

### Display `chargeMinor` (grep: `price_minor` in enrolment/classes UI)

| File | Status |
| ---- | ------ |
| `apps/web/src/components/shared/ClassCard.tsx` | ✅ |
| `apps/web/src/features/classes/components/ClassForm.tsx` | ✅ |
| `apps/web/src/features/classes/components/AdminClassesList.tsx` | ✅ |
| `apps/web/src/features/enrolment/components/EnrolmentStepper.tsx` | ✅ |
| `apps/web/src/features/enrolment/components/AdminEnrolStudentModal.tsx` | ✅ |
| `apps/web/src/pages/EnrolPayPage.tsx` | ✅ (via `computeClassTotal`) |
| `apps/web/src/features/enrolment/components/AdminEnrolmentPaymentStep.tsx` | ✅ (via `computeClassTotal`) |
| `apps/web/src/features/enrolment/lib/adminEnrolmentService.ts` | ✅ (via `computeClassTotal`) |
| `apps/web/src/i18n/en.json`, `he.json` | ✅ |

---

## Phase 5 — Verify

```bash
pnpm -C packages/shared build
pnpm email:bundle
pnpm -C apps/web test -- pricing
```

Manual:

- [ ] Inclusive tenant: class card ₪240 = payment email = pay page = Stripe intent ₪240
- [ ] Exclusive tenant (`prices_include_vat = false`): list ₪240, charge ₪280.80, copy mentions + VAT
- [ ] Offline payment: `pretax_amount_minor + vat_amount_minor = total_amount_minor`
- [ ] Linked remote: `pnpm db:push` after local pass

---

## Out of scope (this slice)

- Morning / Green Invoice API (V2.6)
- Stripe Tax
- Per-offering `prices_include_vat` or `offerings.vat_rate` column
- `vat_registered` / `vat_number` on tenant

## Acceptance criteria

1. One `resolveOfferingPrice()` in web + `create-checkout`.
2. No customer-facing amount differs from Stripe charge.
3. `payments` rows match PaymentIntent metadata breakdown.
4. SPEC §2.5.2 preserved for future Morning integration.
