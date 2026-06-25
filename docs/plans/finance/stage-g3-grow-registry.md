# Stage G3 — Grow registry, credentials, and mock Grow adapter

**Goal:** Plumb Grow into the registries and tenant config without live charges yet.

## Scope IN

- Add `grow` to `supabase/functions/_shared/payments/registry.ts` and
  `supabase/functions/_shared/invoicing/registry.ts`.
- **New migration (RPC only):** `save_tenant_grow_credentials(p_user_id, p_page_code,
  p_api_key)` — sets `payment_provider='grow'`, `invoicing_provider='grow'`, stores encrypted
  creds in the existing BYTEA columns (`payment_provider_account_id` = userId,
  `payment_provider_public_key` = pageCode, encrypt the api key in
  `payment_provider_secret_enc`). Do not edit `20260608001600_finance.sql` in place.
- `get_tenant_payment_credentials` already decrypts — the Grow adapter reads userId/pageCode
  from there.
- IL provisioning in `supabase/migrations/20260608002400_tenant_provisioning.sql`: default
  `grow/grow` for `country='IL'` (dev seed stays `mock/mock`). Add via a new migration, not in
  place.
- Extend `ChargeResult` (`supabase/functions/_shared/payments/types.ts`) with
  `pageUrl?: string` and `pendingWebhook?: true`.
- Stub `GrowPaymentProvider` (`supabase/functions/_shared/payments/providers/grow.ts`) and
  `GrowInvoicingProvider` (`supabase/functions/_shared/invoicing/providers/grow.ts`) throwing
  `not implemented` except the slug.
- `getPaymentProvider` (`supabase/functions/_shared/payments/index.ts`): when
  `slug === 'grow'` **and** `Deno.env.get('GROW_MOCK') === 'true'`, return
  `MockGrowPaymentProvider` (never hit the real API in CI).
- `MockGrowPaymentProvider` (`supabase/functions/_shared/payments/providers/mock-grow.ts`):
  simulates the async webhook via `emitSyncEvent` + document fields on the event (or an
  immediate document write in the mock path only).

## Scope OUT

Real Meshulam HTTP, frontend shell.

## Tests

- Registry Zod accepts `grow`; rejects unknown.
- RPC round-trip test (mocked encryption if needed).
- `MockGrowPaymentProvider` issues a `PaymentEvent` + document fields in one call.

## DoD checklist

- [ ] `pnpm db:sync` applies the RPC migration
- [ ] Types regenerated
- [ ] Provisioning defaults documented
- [ ] Mock Grow adapter unit tested

## Manual gates

After the migration: ask the user to run `pnpm db:sync`, then `pnpm db:types:all`.

## Stop condition

Report the DoD checklist and stop. Do not start Stage G4.
