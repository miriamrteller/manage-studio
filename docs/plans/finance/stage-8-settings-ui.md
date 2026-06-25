# Stage 8 — Settings UI (Payment + Invoicing Credentials, Saved Cards)

> **Depends on:** Stage 1 (`get_billing_account_payment_method` RPC), Stage 3 (`saveCard`).
> **Outcome:** Flow G.

## Payment settings

`StripeSettingsForm.tsx` → `PaymentSettingsForm.tsx`:
- Provider selector (registry slugs); saves via `save_tenant_payment_credentials`.
- Route `/admin/setup/payments`; update nav + `TenantSettingsHub.tsx`.

## Invoicing settings

`InvoicingSettingsForm.tsx`:
- Provider selector (`green_invoice` / `mock`; future slugs disabled until adapter exists).
- V1: show GI credential fields when `green_invoice` selected (hardcoded field set OK for V1).
- Saves via `save_tenant_invoicing_credentials`.
- Test connection → `verify-invoicing-credentials`.
- Route `/admin/setup/invoicing`.

## Saved cards — safe display RPC (defined Stage 1)

**Never** `SELECT` from `payment_method_tokens` in the client.

```ts
// Client calls:
supabase.rpc('get_billing_account_payment_method', { p_billing_account_id })
// Returns: { card_brand, last4, exp_month, exp_year, is_default } | empty
```

Add/update card → `save-card` Edge Function → `payment_method_tokens` default row (server-side only).

## Billing account create (admin)

When admins create billing accounts via the web app, `BillingAccountCreateSchema` must require
`account_id` (household) with optional `person_id` (primary contact). Matches Stage 1
`billing_account_owner` CHECK and guest enrolment RPC behaviour.

## SPEC updates

§7 checklist + settings route table.

## Definition of Done

- [ ] Credentials save; secrets never returned to client.
- [ ] Invoicing test connection (GI sandbox when configured).
- [ ] Saved card via RPC display + save-card flow.
- [ ] No Stripe-only user-facing naming.
- [ ] Committed; `main` green.

## Test cases

1. Masked credential display.
2. Test connection success/failure.
3. Mock card save + RPC read.
4. Card replace — one default.
5. Non-admin blocked.
