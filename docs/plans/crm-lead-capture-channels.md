# CRM lead capture — multi-tenant, self-onboard, all channels

**Status:** phase 2b shipped (email ingest, PR #55); step 1 of this plan in progress.
**Owner decision (2026-08-19):** no per-tenant onboarding tasks, ever — the platform
sets up once, and capture works for every tenant the moment it is provisioned.
**Related:** PR #52 (crm-contacts feed), #54 (leads table), #55 (email ingest),
`workers/lead-email-ingest/README.md`, SPEC §2.5.3 (additive migrations only).

## The self-onboard principle

Two platform-side switches, flipped once:

1. **Email catch-all** on opalswift.com → `lead-email-ingest` worker. The worker
   ignores any address not matching `leads-<subdomain>@`, and the edge function
   resolves the tenant from the `tenants` table — so `leads-<new-tenant>@opalswift.com`
   works the instant the tenant row exists. No per-tenant routing rules.
2. **New-lead notification is SENT, not forwarded.** Email Routing forwards
   require a click-verified destination per studio (a banned onboarding task).
   Instead `crm-lead-ingest` sends a "new lead" email to `tenants.contact_email`
   via the platform's Cloudflare Email *Sending* path — no verification, works
   for every tenant automatically, best-effort (never fails the capture).

## Channel matrix

| Channel | Status | Mechanism |
|---|---|---|
| Email | ✅ shipped (#55) | `leads-<subdomain>@opalswift.com` → Email Worker → `crm-lead-ingest` → `leads` row. Message-ID dedupe; follow-up from an open lead = touchpoint update. |
| Manual | data layer ✅, UI missing | `leads` already grants tenant admins full DML under RLS. Needs an admin page: leads list + "New lead" form with channel picker (a WhatsApp inquiry gets logged with channel `whatsapp`). |
| Website | not built | Public rate-limited `crm-lead-capture` edge function + inquiry form on the tenant's subdomain site. Honeypot + the `send-otp-sms` rate-limit pattern. Channel `website`. |
| Instagram / LinkedIn / Facebook | solved via **capture links** | No self-serve inbound-DM APIs exist (IG needs per-tenant app review/OAuth; LinkedIn has none). The same website form with a source tag — `…/inquire?src=instagram` — lands the lead with channel `instagram`. One endpoint, every platform, zero per-tenant integration. |
| WhatsApp (automatic) | deferred — the hard one | True inbound WhatsApp needs a number per tenant (WABA onboarding — not self-serve). Later options: shared platform number with a tenant ref code in the wa.me prefill, or per-tenant Twilio numbers as a paid add-on. Until then WhatsApp leads arrive via capture link (`?src=whatsapp`) or manual entry. |

## Tenant-facing self-onboarding

A **"Lead capture" panel** in the admin app that shows each studio its own
plumbing: the lead email address, the form URL, and ready-made tagged links for
IG bio / Facebook / WhatsApp status. Copy-paste. That panel IS the onboarding.

## Build order

1. **Step 1 (small, current PR stack — in progress):**
   - Worker/docs: catch-all instead of per-address routing; drop `FORWARD_TO`.
   - `crm-lead-ingest`: best-effort new-lead notification email to
     `tenants.contact_email` via the shared email-send path + `notification_log`.
   - `crm-contacts` CORS: allow `https://<subdomain>.<APP_ROOT_DOMAIN>` for any
     tenant subdomain shape (platform controls that DNS), keeping localhost:8081
     and `CRM_CONTACTS_ALLOWED_ORIGIN`.
2. **Step 2 (next PR, the feature):** `crm-lead-capture` public endpoint +
   admin leads page (list, New-lead form, capture-links panel). Delivers
   manual + website + social-via-links in one stroke.
3. **Step 3 (later, optional):** shared-number WhatsApp ingest; CRM app served
   inside the tenant admin portal with runtime session-token injection
   (replaces the dev-grade `EXPO_PUBLIC_CONTACTS_TOKEN`; the mobile-crm
   contract gains nothing — only token acquisition changes). Pagination /
   server-side query params = contract v2.

## Standing constraints

- Additive migrations only (SPEC §2.5.3) — no base-chain edits, no dev reset.
- Contract changes land in mobile-crm first (`contracts/contact.v1.ts`), then
  re-vendor into `supabase/functions/_shared/crm-contract/`. Optional additive
  fields are non-breaking; anything else bumps `contractVersion`.
- Never fabricate contact fields — null renders as an em-dash by design.
- `leads` is the only table lead capture may write. Medical/consent data from
  the operational stack must never leak into the CRM.
