# V3.0 — Operator tenant provisioning wizard

**Status:** Implemented (scaffold)  
**Route:** `/platform/onboard`  
**Audience:** `super_admin` only  
**SPEC:** §9 V3.0

## Purpose

Replace hand-editing `seed.sql` when standing up a second industry tenant (services, catalog, or another dance school). Evolves into §9 V3.1 public self-service signup later.

## Prerequisites

- Ballet V1 feature-complete
- Admin settings hub forms (shared branding/locale patterns)
- `provision_tenant` + `check_subdomain_available` RPCs (migration `20260607000000_provision_tenant.sql`)
- Per-tenant Twilio/Resend (§6.x #4) — integration steps skippable until schema ships

## Wizard steps

1. Identity — name, subdomain, `business_preset`
2. Terminology — optional `labels` JSONB overrides
3. Branding — colors
4. Locale — language, country, currency, phone_region
5. Tax — VAT settings
6. Integrations — skippable (Stripe/Twilio/Resend placeholders)
7. Starter data — expense category auto-seed via RPC
8. Review & provision — `provision_tenant` RPC; admin account via signup with subdomain metadata

## Admin account (step 8)

Auth trigger `handle_new_user` reads `subdomain` from `raw_user_meta_data`. After provisioning, operator invites admin to sign up with the new subdomain; then promotes role to `tenant_admin` via Supabase dashboard or future `promote_tenant_admin` RPC.

## Backend

- `check_subdomain_available(p_subdomain)` — public to authenticated super_admin
- `provision_tenant(...)` — SECURITY DEFINER, `is_super_admin()` guard, inserts tenant + seeds expense categories

## Polish / follow-up (before first real use)

- **Color picker:** Replace the native `<input type="color">` in the branding step with [`react-colorful`](https://github.com/omgovich/react-colorful) — use `HexColorPicker` + `HexColorInput` wrapped in a lightweight popover (custom `useRef`/`onBlur`, no extra library). 2.8 KB gzipped, zero dependencies. Install: `pnpm -C apps/web add react-colorful`. Also applies to `BrandingSettingsForm` in the admin settings hub. Do this when the wizard is first exercised against a real second tenant, not before.
