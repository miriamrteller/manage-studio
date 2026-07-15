# Ballet School Management System

## Complete Implementation Blueprint — v2.0

> **Architectural priority order:** Reliability → Scalability → Correctness → Readability → AI integration
> These priorities govern every decision. AI features are well-defined optional modules that could be
> removed without affecting core system function. The base system must work perfectly without them.
>
> **How to use this document:** This is the authoritative specification for your AI coding agent
> (Copilot, Cursor, Claude Code). Paste into agent context at the start of every session.
> Every decision here is intentional. Flag conflicts rather than working around them.
>
> **Developer profile:** Senior React/TypeScript developer expanding into AI integration engineering.
> Architecture minimises custom backend surface area while building solid AI integration foundations.

---

## Table of Contents

1. [Core Principles](#1-core-principles)
2. [Technology Stack](#2-technology-stack)
3. [Repository Structure](#3-repository-structure)
4. [Database Schema — full multi-tenant design](#4-database-schema)
5. [Auth & Authorisation](#5-auth--authorisation)
6. [V1 Implementation — phase by phase](#6-v1-implementation)
7. [V1 Production Deployment](#7-v1-production-deployment)
8. [V2 Roadmap](#8-v2-roadmap)
9. [V3 SaaS Roadmap](#9-v3-saas-roadmap)
10. [AI Integration Specification](#10-ai-integration-specification)
11. [Testing Strategy](#11-testing-strategy)
12. [Agent Working Instructions](#12-agent-working-instructions)

---

## Visual Conventions

Throughout this document, callouts highlight critical information:

```
⚠️  **WARNING:** Critical constraint or breaking change
    Content here. Takes priority over defaults.

✅  **NOTE:** Important but non-breaking information
    Content here. Best practice or clarification.

🔒  **SECURITY:** Security or compliance requirement
    Content here. Must be implemented exactly as stated.

⏱️  **TIMING:** Sequencing or dependency constraint
    Content here. Must be done in this order.
```

---

## 1. Core Principles

Apply in order when facing any ambiguous decision.

**1.1 Reliability first.**
This system manages children, payments, and legal obligations. A boring CRUD approach that works at 11pm on recital night beats an elegant abstraction that fails. AI features are enhancement modules — the system must be fully functional without them.

**1.2 Multi-tenant from row one.**
Every school-specific table carries `tenant_id UUID NOT NULL`. Every RLS policy enforces it. Your first tenant is your own school. This costs almost nothing to add now and saves weeks of migration later.

**1.3 Fail loudly, fail safely.**
Payment flows, enrolment transitions, and data deletion throw explicit typed errors. Never swallow silently. `unknown` over `any`. Zod on all external data including Stripe webhooks.

**1.4 The frontend owns the experience.**
Backend logic lives in Edge Functions only when required (secrets, Stripe, external APIs). Everything else uses the typed Supabase client directly from React hooks.

**1.5 Features are self-contained modules.**
`src/features/enrolment/` contains its own components, hooks, types, and API calls. An AI agent can work on one feature without understanding the rest.

**1.6 Read-your-writes consistency.**
After every mutation, invalidate and refetch the relevant TanStack Query key immediately. No stale state after user actions.

**1.7 Audit everything that matters.**
Payments, enrolment changes, email and WhatsApp sends, and data deletions write to `audit_log`. This is your legal protection when disputes arise.

**1.8 Additive migrations only.**
Never drop a column in a single migration. Add → deploy → verify → drop in a later migration.

**1.9 RTL and Hebrew are first-class concerns.**
The system is built for Israel. RTL layout, Hebrew locale formatting, and Israeli legal requirements are not afterthoughts — they are part of the initial design.

**1.9.1 No hard-coded UI strings.**
All user-facing text lives in i18n translation files (`he.json`, `en.json`).
Components use `const { t } = useTranslation()` to access strings.
This enables: proper RTL testing (flip to English + `dir="ltr"` to verify layout),
language switch without code changes, regional customization per tenant (V3).
Hard-coded strings discovered during Phase reviews must be refactored immediately
before merge to main. Pattern: move string to translation file, add hook to component.

**1.10 External API keys belong to tenants, not the platform.**
Each school configures their own Twilio, Resend, and Stripe keys. You store them encrypted. Schools pay their own communication costs. This eliminates margin risk and billing complexity in early stages.

**1.11 Accessibility is mandatory, not optional.**
WCAG 2.1 Level AA is a legal requirement for Israeli community centers (דינ נגישות לאנשים עם מוגבלות, 1998). All UI features must pass automated axe-core tests before merge. Manual NVDA Hebrew smoke tests verify 15 minutes pre-deployment. Accessibility is part of the Definition of Done for every feature.

**1.12 Tenant branding and configuration are separate from code.**
Each tenant has configurable properties: `language_default`, `country`, `currency`, `vat_rate`, `prices_include_vat`, `primary_color`, `accent_color`, and future fields like `logo_url`.

- **Never hardcode tenant-specific values** in components (no `text-[#76335a]`, no `'he-IL'` strings).
- **Always use CSS variables and configuration hooks** (`useTenant()` for locale, CSS variables for colors/fonts).
- Define colors in `:root` CSS variables and Tailwind `theme.extend.colors` → all components use `text-primary`, `text-accent`.
- **Language and direction:** `language_default` on `tenants` is the tenant default. `user_profiles.language` overrides when NOT NULL. **`dir` (rtl/ltr) is never stored in the database** — computed in the app from resolved language only (`he` → `rtl`, else `ltr`) via `DocumentLanguageSync` on `<html>`. Precedence: profile language → tenant `language_default` → `'he'`. Locale strings (e.g. `he-IL`) are derived from `language` + `country`, not stored on `tenants`.
- Define locale in `useTenant()` (computed from `language_default` + `country`, e.g. `he-IL`).
- Define page titles and branding text in i18n translation files (`he.json`, `en.json`) → no hardcoding in HTML or components.

**Design System (3-layer CSS architecture):**
- **Layer 1** (Core Primitives): Primary, secondary, status colors (error/warning/success/info), neutral scale — all defined in `:root` CSS variables.
- **Layer 2** (Semantic Intent): Derived variants (light/hover/active) and intent-based colors (text-primary, border-focus) — used by components.
- **Layer 3** (Component CSS): Classes (`.form-input`, `.button`, `.card`) referencing Layer 2 variables — zero inline colors.

**Color Derivation:** Primary color automatically expands to 30+ semantic colors via `deriveColorSystem()` (primary family, secondary family if provided, status colors, neutral scale). All variants (`primary_light`, `primary_hover`, `primary_active`) computed in `src/lib/utils.ts`, injected via `useThemeInjection()` hook.

**White-Label Scope:** Tenants customize primary color, optional secondary color, and logo. System auto-detects warm vs cool background based on primary hue. Locked: background colors, text colors, spacing, typography (ensures professionalism and WCAG compliance).

- **Rationale:** Enables white-labeling (V3), per-tenant customization without code changes, and clean tenant isolation.
- **Pattern:** Move hardcoded values to config → 1) update CSS variables for colors/fonts, 2) update schemas for tenant fields, 3) update components to reference config, not hardcodes.
- **Example:** Change `<h1 className="text-[#76335a]">` to `<h1 className="text-primary">` → uses CSS variable.

**1.13 Schema-first implementation — non-negotiable.**

Forms and components derive from database schemas, never the reverse.
Before writing any component that reads/writes data:

1. Read the exact schema definition in SPEC.md (Migration 00X)
2. Import the actual Zod schema from `@shared/schemas`
3. Use that schema to define form fields — never assume field names
4. Run `pnpm run build` immediately after the FIRST component
5. Fix all type errors before moving to dependent components

This prevents cascading schema mismatches across features.

**Why it matters:**
PersonForm with wrong field names → PeopleList inherits wrong types → PeoplePage inherits wrong types → 80+ TypeScript errors discovered after 5 components built. **Better approach:** Build PersonForm + `pnpm run build` → caught immediately → fix once → proceed.

**Rationale (learned from Stream 1 implementation):**
Detailed SPEC.md documentation exists. Developer read it. Forms were still built with `first_name`/`last_name` instead of schema's single `name` field. Why? Form design intuition ("that's how people data works") overrode schema verification. ESLint caught syntax but not semantics. Build validation only ran after all components were written — by then 80+ cascading errors. Cost: 2 hours to unwind.

**Prevention:** Enforce schema-first at principle level. Make it non-negotiable. Make build gate immediate (after component 1, not after component 5).

---

## 2. Technology Stack

### 2.1 Core

| Layer                           | Choice                        | Reason                                                              |
| ------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| Frontend                        | React 18 + TypeScript 5       | Core expertise; maximum leverage                                    |
| Build                           | Vite 5                        | Fast HMR, Vitest co-location                                        |
| Routing                         | React Router v6 (data router) | Loader/action pattern fits multi-role app                           |
| Server state                    | TanStack Query v5             | Best-in-class cache invalidation                                    |
| Forms                           | React Hook Form + Zod         | Type-safe, minimal re-renders                                       |
| UI components                   | shadcn/ui (Radix primitives)  | Accessible, owned not depended on                                   |
| Styling                         | Tailwind CSS v3               | RTL logical properties support; pairs with shadcn                   |
| RTL support                     | `tailwindcss-rtl` plugin      | Adds `ms-`, `me-`, `ps-`, `pe-` logical utilities                   |
| Backend                         | Supabase                      | Postgres + Auth + RLS + Edge Functions + Storage + Realtime         |
| Payments                        | Stripe                        | Subscriptions, intents, webhooks, Connect                           |
| Email                           | Resend + React Email          | Typed templates, per-tenant API keys                                |
| WhatsApp + Voice                | Twilio                        | Only provider with reliable WhatsApp Business API in Israel         |
| AI                              | Anthropic Claude API          | `claude-sonnet-4-6` for chatbot and communication drafting          |
| **Accessibility (WCAG 2.1 AA)** | **ESLint jsx-a11y**           | **Write-time linting for semantic HTML, ARIA, keyboard nav**        |
|                                 | **axe-core**                  | **Merge-time hard gate: zero violations on all UI features**        |
|                                 | **Playwright a11y tests**     | **E2E verification: heading structure, focus traps, contrast, RTL** |
|                                 | **NVDA Hebrew**               | **Ship-time manual: Israeli screen reader smoke test (15 min)**     |

### 2.2 Supporting libraries

| Library                                        | Purpose                                                  |
| ---------------------------------------------- | -------------------------------------------------------- |
| Zod                                            | Runtime validation of all external data                  |
| date-fns                                       | Date manipulation with locale support                    |
| FullCalendar + `@fullcalendar/core/locales/he` | **Timetable display only** (month/week); not the booking engine |
| Recharts                                       | Finance dashboard charts                                 |
| Lucide React                                   | Icon set                                                 |
| clsx + tailwind-merge                          | Conditional class composition                            |
| i18next + react-i18next                        | Internationalisation (Hebrew primary, English secondary) |

### 2.2.1 Scheduling — three layers (native booking + Google Calendar)

**Product decisions (2026-07):**

- **Cal.com is out of scope** — no OAuth, webhooks, or Platform Atoms.
- **Appointment booking** is first-party UI + Postgres + existing checkout — **not** outsourced to a booking SaaS.
- **Google Calendar** is the **external calendar integration** for appointment tenants: OAuth connect, **free/busy** for availability, **push events** when a booking is confirmed (`active` or `pending_waiver`).
- **Client “Add to calendar”** after payment uses a Google Calendar template URL + `.ics` download — **no** client OAuth.

| Layer | Purpose | Stack | Feature flag |
| --- | --- | --- | --- |
| **Calendar view** | Month/week timetable for class offerings/sessions | **FullCalendar** (read-only) on `/classes` | `scheduling:calendar.view` |
| **Slot booking** | Client picks slot on `/book` → hold → pay → optional waiver | Custom React + edge functions | `scheduling:booking.client`, `scheduling:booking.admin` |
| **Google Calendar** | Studio calendar sync for appointments | Google Calendar API (OAuth 2.0, refresh tokens encrypted at rest; signed OAuth `state`) | `scheduling:integration.google_calendar` |

**Division of responsibility:**

| Concern | Owner |
| --- | --- |
| Slot picker UI, holds, pricing, payment, invoice | **Manage Studio** (native) |
| “Is this time already busy on the provider’s calendar?” | **Google Calendar** (`freebusy.query`) when integration enabled (fail-closed) |
| “Show this appointment on the **studio** calendar” | **Google Calendar** (`events.insert` on confirm; `delete` on cancel) |
| “Add to **my** (client) calendar” | Manage Studio calendar URL + `.ics` on payment success |
| Group class term enrolment | **`/enrol`** wizard — unchanged |

**Do not use FullCalendar or Google embed widgets for checkout** — payment stays on the existing finance spine (Grow / iCount / Mock).

**Offering model:** `offerings.offering_type` is `'class'` or `'appointment'` (not `is_bookable`). Appointment availability uses `tenant_scheduling_hours`; occupancy includes `pending_payment`, `active`, and `pending_waiver`.

**Google setup (tenant admin):** Booking Settings → Connect Google Calendar → OAuth callback `{APP_URL}/admin/setup/integrations/google/callback`. Working hours + slot rules stay in Manage Studio; Google blocks externally busy times.

**Safety (booking):** checkout email must match the hold’s `client_email`; `finalise-payment` does not reactivate cancelled/expired holds; hours replace is transactional (`replace_tenant_scheduling_hours`).

**Group classes (Professional):** recurring offerings → FullCalendar → **`/enrol`**. Google Calendar is **optional** for appointments (`scheduling:integration.google_calendar`).

**Plans:** [docs/plans/scheduling/00-overview.md](docs/plans/scheduling/00-overview.md), [docs/plans/scheduling/google-calendar-integration.md](docs/plans/scheduling/google-calendar-integration.md), [docs/plans/scheduling/deployment-and-testing.md](docs/plans/scheduling/deployment-and-testing.md)

### 2.3 Infrastructure (per tenant — pass-through model)

| Service        | Who pays       | How configured                                      |
| -------------- | -------------- | --------------------------------------------------- |
| Vercel         | Platform owner | Central; serves all tenants via wildcard subdomain  |
| Supabase Cloud | Platform owner | Central database; tenant isolation via RLS          |
| Stripe         | Each tenant    | Their own Stripe account key stored encrypted       |
| Resend         | Each tenant    | Their own API key stored encrypted                  |
| Twilio         | Each tenant    | Their own account SID + auth token stored encrypted |

**Rationale for pass-through:** Each school pays their own Twilio/Resend costs directly. You have zero margin risk, zero billing complexity, and zero liability for their communication failures. Move to an aggregated model in V4 once you understand usage patterns.

### 2.3.1 Tech Stack Dependency Graph

```
Frontend (React 18 + TS5)
  ├─ React Router v6 (routing)
  │   └─ TanStack Query v5 (server state)
  │       └─ Supabase Client
  │           ├─ Auth (session management)
  │           └─ RLS (row-level security)
  │
  ├─ React Hook Form + Zod (form validation)
  │   └─ Zod (runtime validation)
  │
  ├─ Tailwind CSS v3 (styling)
  │   ├─ tailwindcss-rtl (RTL support)
  │   └─ shadcn/ui (component library)
  │       └─ Radix UI (accessible primitives)
  │
  ├─ i18next + react-i18next (translations)
  │   ├─ he.json (Hebrew — primary)
  │   └─ en.json (English — secondary)
  │
  └─ Date + Number Formatting
      ├─ date-fns + locale support
      ├─ Intl.NumberFormat (currency, locale-aware)
      └─ Intl.DateTimeFormat (dates, locale-aware)

Edge Functions
  ├─ Stripe API (payments, webhooks)
  │   ├─ PaymentIntent creation
  │   ├─ Webhook signature verification
  │   └─ Subscription management (V2)
  │
  ├─ Resend API (email)
  │   └─ React Email templates
  │
  ├─ Twilio API (WhatsApp, Voice)
  │   ├─ Message delivery
  │   └─ Phone verification
  │
  ├─ Anthropic Claude API (AI)
  │   ├─ Eligibility evaluation
  │   └─ Communication drafting
  │
  └─ Supabase (database, auth)
      ├─ PostgreSQL (data)
      ├─ RLS policies (security)
      └─ Functions (atomic operations)
```

### 2.4 Infrastructure (per tenant — pass-through model)

| Excluded                   | Why                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------- |
| Custom Express/Node server | Supabase Edge Functions cover all backend needs                                       |
| Redux / Zustand            | TanStack Query handles server state; React built-ins for UI state                     |
| SMS                        | WhatsApp covers the Israeli market; SMS adds cost and a third provider for no benefit |
| Docker                     | Not needed; Vercel + Supabase handle deployment                                       |

### 2.5 Data and calculation strategy

#### 2.5.1 Class price & VAT semantics (canonical)

**Problem (V1 bug):** `offerings.price_minor` is shown raw in the catalogue (e.g. ₪240) while checkout/email/Stripe add 17% VAT (₪280.80). Admin expects the entered price to be what the customer pays.

**Locked decisions:**

| Decision | Value |
| -------- | ----- |
| Tenant flag | `tenants.prices_include_vat BOOLEAN NOT NULL DEFAULT true` |
| Default for IL B2C schools | `true` — admin-entered price is **gross** (what customer pays) |
| Alternative mode | `false` — admin-entered price is **net**; VAT added at checkout |
| V1 scope | Tenant-level flag only (no per-offering inclusive/exclusive override) |
| `offerings.price_minor` | Always the admin-entered list price; meaning depends on `prices_include_vat` |
| Rate | `vat_rate = tenant.vat_rate ?? 0.17` (V1; per-offering `vat_rate` deferred until `offerings.vat_rate` column exists) |
| Dev schema changes | Edit **base** migration `20260608000200_core_tenants.sql` (do not add a one-off `ALTER` migration in dev); reset DB and re-push all migrations (see §2.5.3) |

**Single implementation module:** `packages/shared/src/pricing.ts` (exported from `@shared`). All UI, Edge Functions, and offline payment recording call `resolveOfferingPrice()` — never duplicate formulas in Deno or React.

**`resolveOfferingPrice()` contract** (all amounts in minor currency units):

| Field | Inclusive (`prices_include_vat = true`) | Exclusive (`= false`) |
| ----- | --------------------------------------- | --------------------- |
| `listMinor` | `price_minor` | `price_minor` |
| `chargeMinor` | `price_minor` | `price_minor + round(price_minor × vat_rate)` |
| `pretaxMinor` | `round(price_minor / (1 + vat_rate))` | `price_minor` |
| `vatMinor` | `chargeMinor - pretaxMinor` | `chargeMinor - pretaxMinor` |
| `totalMinor` | same as `chargeMinor` | same as `chargeMinor` |

**Display rules:**

- Customer-facing surfaces (class cards, enrolment, payment email, pay page) show **`chargeMinor`** via `formatCurrency()` from `packages/shared/src/format.ts`.
- Admin class form label/help reflects tenant mode (“incl. VAT” / “excl. VAT”).
- Checkout summary (Phase 1C) may show pretax + VAT lines for transparency; **total line must equal `chargeMinor`**.

**VAT split helper (inclusive mode)** — Issue #12; V1 uses `Math.round` on pretax (banker's rounding deferred):

```typescript
// packages/shared/src/pricing.ts
export function calculateVat(totalMinor: number, vatRate: number) {
  const pretaxExact = totalMinor / (1 + vatRate);
  const pretax = Math.round(pretaxExact);
  const vat = totalMinor - pretax;
  return { pretax, vat, total: totalMinor };
}

export function addVatToPretax(pretaxMinor: number, vatRate: number) {
  const vat = Math.round(pretaxMinor * vatRate);
  return { pretax: pretaxMinor, vat, total: pretaxMinor + vat };
}

export function resolveOfferingPrice(
  offering: { price_minor: number },
  tenant: { vat_rate: number; prices_include_vat: boolean },
) { /* implements table above; V1 uses tenant.vat_rate only */ }
```

`apps/web/src/features/enrolment/lib/computeClassTotal.ts` remains a thin wrapper around `resolveOfferingPrice()` for backwards compatibility.

#### 2.5.2 External integrations — what we own vs Stripe / Morning (Green Invoice)

Manage Studio is the **system of record for enrolment pricing consistency**. Third parties handle payment capture and tax document issuance; they must receive amounts we have already resolved — not re-interpret catalogue prices.

| Layer | Owner | Responsibility |
| ----- | ----- | -------------- |
| **List price semantics** | Manage Studio | `price_minor` + `prices_include_vat` → `resolveOfferingPrice()` |
| **UI / email / quotes** | Manage Studio | Always `chargeMinor`; optional VAT breakdown |
| **`payments` row** | Manage Studio | Immutable `pretax_amount_minor`, `vat_amount_minor`, `total_amount_minor`, `vat_rate` at time of payment |
| **Card capture** | Stripe | `PaymentIntent.amount = totalMinor` (minor units); metadata carries our breakdown for webhook |
| **Tax invoice PDF / allocation number** | Morning API / Green Invoice (V2.6) | Legal document generation; **input line amounts = our `payments` breakdown**, not a second VAT calculation |
| **Accounting export** | Manage Studio → CSV (V2.7) | Reads `payments` / `expenses`; no duplicate math |

**Stripe (V1):**

- Edge Function `create-checkout` loads offering + tenant, calls `resolveOfferingPrice()`, creates `PaymentIntent` with `amount: totalMinor`.
- Metadata: `pretax_amount_minor`, `vat_amount_minor`, `total_amount_minor`, `vat_rate`, `prices_include_vat` (string), `tenant_id`, `engagement_id`, `offering_id`.
- `stripe-webhook` persists metadata into `payments` — does not re-derive VAT from `offerings.price_minor` alone.
- Stripe Tax / automatic tax products are **out of scope for V1**; Israeli VAT is app-computed.

**Morning / Green Invoice (V2.6):**

- Trigger: `payment_intent.succeeded` (or batch job) after `payments` insert.
- Request body uses **`payments.pretax_amount_minor`**, **`payments.vat_amount_minor`**, **`payments.total_amount_minor`** — same numbers the parent saw.
- Store provider `document_id` / PDF URL in `payments.invoice_url`; optional `external_invoice_provider` + `external_invoice_id` columns when integrated.
- If Morning API rejects amounts (rounding mismatch), fix `resolveOfferingPrice()` once — do not maintain parallel VAT logic in the Edge Function.

**Anti-patterns (forbidden):**

- Showing `offerings.price_minor` to parents when `prices_include_vat` does not match display intent.
- Adding VAT on top of an inclusive price in `create-checkout`.
- Letting Stripe dashboard tax settings override per-enrolment amounts.
- Recomputing VAT inside the Morning/Green Invoice adapter from gross catalogue price.

#### 2.5.3 Dev schema change workflow (V1 — edit base migrations)

> **`prices_include_vat`:** Steps 1–4 and reset completed (2026-06). Proceed with Phases 2–5 in [docs/plans/2026-06-02-vat-pricing.md](docs/plans/2026-06-02-vat-pricing.md).

When changing core columns in **dev only** (no production tenants yet):

1. Edit the **original** migration file (e.g. add `prices_include_vat` to `20260608000200_core_tenants.sql`).
2. Update `get_tenant_config_by_subdomain` in `20260608001800_public_rpcs.sql` to return the new column.
3. Grep repo for `vat_rate`, `price_minor`, `pretax`, `computeClassTotal`, `create-checkout` — align Edge Functions and web.
4. Update `supabase/seed.sql` tenant `INSERT` (include `prices_include_vat = true`).
5. Reset and re-apply (local):
   ```bash
   pnpm db:reset-local          # or: supabase/reset_dev_db.sql then pnpm db:push
   psql ... -f supabase/seed.sql   # if seed not auto-run on reset
   pnpm db:types
   pnpm email:bundle            # refresh edge _shared/email-dist after shared build
   ```
6. Remote dev project: `pnpm db:push` after reset script clears migration history (see §4.2).

**Implementation plan (agent checklist):** [docs/plans/2026-06-02-vat-pricing.md](docs/plans/2026-06-02-vat-pricing.md)

**Status:** Implemented — `packages/shared/src/pricing.ts`, `create-checkout`, catalogue/pay UI, `/admin/setup/tax`. Verify after deploy: `pnpm email:bundle`. Track in [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

### 2.6 Accessibility compliance — WCAG 2.1 Level AA

🔒 **SECURITY & LEGAL — Non-negotiable Requirement:**
Israeli law (דינ נגישות לאנשים עם מוגבלות, 1998) requires all digital interfaces in community centers to be accessible to people with disabilities. This is a legal mandate, not optional. Non-compliance = no license to operate.

**Scope:** All UI components must pass WCAG 2.1 Level AA criteria. Priority: heading structure, form labeling, keyboard navigation, color contrast, focus management, and ARIA patterns.

**Three-layer enforcement model:**

1. **Write-time** (ESLint jsx-a11y): Developers see warnings in IDE as they code
   - Missing labels on inputs → warning
   - Headings skip levels (h1 → h3) → warning
   - Click handlers without keyboard support → warning
   - **Result:** Non-blocking; helps catch issues early

2. **Merge-time** (axe-core CI gate): Hard blocker — zero violations required
   - Every PR runs `pnpm run a11y:e2e` (Playwright + axe)
   - Detects contrast failures, ARIA misuse, semantic issues
   - Fails PR if violations found
   - **Result:** Blocking; prevents inaccessible code from merging

3. **Ship-time** (Manual Hebrew screen reader test): 15-minute smoke test before production
   - Test with NVDA (Israeli screen reader) in Hebrew mode
   - Verify tab order, focus traps, form announcements
   - Check RTL layout logic
   - PM/QA sign-off required
   - **Result:** Catches algorithmic issues masked by automation

**Testing strategy:**

```typescript
// e2e/accessibility-compliance.spec.ts — Full test suite included in Phase 1 checklist
import { test, expect } from "@playwright/test";
import { injectAxe, checkA11y } from "axe-playwright";

test("heading structure is valid", async ({ page }) => {
  await page.goto("/");
  await injectAxe(page);
  await checkA11y(page);

  // Verify no level skips
  const headings = await page.locator("h1, h2, h3, h4, h5, h6").all();
  for (let i = 1; i < headings.length; i++) {
    const current = await headings[i].evaluate((el) => parseInt(el.tagName[1]));
    const previous = await headings[i - 1].evaluate((el) =>
      parseInt(el.tagName[1]),
    );
    expect(current - previous).toBeLessThanOrEqual(1);
  }
});

// Additional tests for forms, modals, keyboard nav, contrast, landmarks, etc.
```

**Tools & libraries:**

- `eslint-plugin-jsx-a11y`: Static analysis (write-time)
- `@axe-core/react` + `axe-playwright`: Automated testing (merge-time)
- `NVDA` (screen reader): Manual verification (ship-time, Israeli language)
- APCA contrast checker: Verify contrast ratios for Hebrew fonts

### 2.6.1 Language & Direction (RTL/LTR)

**Principles:**
- Language is source of truth; direction is derived (he→rtl, en→ltr)
- **`dir` is never stored in the database** — not on `tenants`, not on `user_profiles`
- `LanguageProvider` resolves language; `DocumentLanguageSync` sets `<html lang>` and `<html dir>`
- Components never set document direction; they inherit from `<html>` (exception: isolated fields e.g. phone inputs may use `dir="ltr"`)

**Backend (Tenants + profiles):**
- `tenants.language_default` (`'he' | 'en'`) — tenant default
- `user_profiles.language` — when NOT NULL, overrides tenant default
- `tenants.country` (`'IL' | 'US'`) — used with language to compute locale string in the app
- No `tenants.dir`, no `tenants.locale` column

**Resolved language precedence (app):** `user_profiles.language` → `tenants.language_default` → `'he'`

**Frontend (`TenantConfig`):**
```typescript
type TenantConfig = {
  id: string;
  name: string;
  subdomain: string;
  language_default: 'he' | 'en';
  country: 'IL' | 'US';
  currency: string;
  vat_rate: number;
  white_label?: TenantWhiteLabel;
  locale: string; // Derived via getLocale(language_default, country), e.g. 'he-IL'
  // No dir property — use resolveLanguage() + languageToDir() for <html> only
};
```

**`DocumentLanguageSync` (mounted inside `LanguageProvider`):**
- Watches resolved language from profile + tenant
- Sets `document.documentElement.lang` and `document.documentElement.dir`

**CSS Cascade:** All children inherit from `<html>` via logical CSS properties (ms-, pe-, inset-inline-start)

**Logical Properties (Required):**
- MANDATORY: All CSS must use logical properties (e.g., `margin-inline-start` instead of `margin-left`, `padding-block` instead of `padding-top`).
- Font-Stack Switching: When `lang === 'he'`, prioritize 'Assistant' or 'Heebo'. When `lang === 'en'`, prioritize 'Inter'.
- Mirroring: UI components automatically flip based on the `dir` attribute of the HTML root, with zero manual CSS overrides per page.

### 2.7 Third-Party Service Configuration

Detailed setup instructions for all external services (Twilio, Resend, Stripe) are documented separately to keep this spec focused on architecture.

**Required reading before Phase 2 Edge Functions deployment:**

- [Third-Party Services Setup Guide](docs/deployment/THIRD_PARTY_SERVICES.md) — Complete walkthrough for Twilio WhatsApp, Resend email, Stripe payments, and self-hosted waiver storage
- Service credentials are stored encrypted in Supabase and accessed via `getTenantConfig()` function (see Section 5.2)
- Each service is tenant-configurable (Phase 2); platform defaults available (Phase 1)

**Services covered:**
- **Twilio Verify + WhatsApp** — OTP delivery and two-way messaging
- **Resend** — Transactional email via React Email templates
- **Stripe** — Payment processing and webhooks

### 2.7.1 Self-Hosted Waiver Evidence (V1)

Waiver signatures are legally sensitive records (minor participation and guardian consent). **V1 uses a self-hosted acceptance flow** — no third-party e-sign vendor. The system captures acceptance in-app, stores the exact legal wording and rendered PDF at signing time, and maintains a tamper-evident audit trail.

**V1 approach:**
- Parent/guardian (or adult student) reads active `consent_templates` content in-app.
- Signer affirms via checkbox + typed legal name (`typed_name_checkbox` method).
- When signing on behalf of a minor, signer must additionally check a guardian declaration checkbox confirming parental/legal-guardian authority. Stored as `guardian_confirmed` in the tamper-evident record.
- Edge Function `accept-waiver` atomically writes immutable evidence, events, and `audit_log` entry.
- PDF generation is **V1-deferred** — the `waiver_evidence` DB record (with `wording_snapshot` + `record_hmac`) is the legally operative evidence for V1. A `v1-deferred` sentinel is stored in `pdf_storage_path`; on-demand PDF export from the admin panel is planned for V2.
- `offering_id` on `waiver_evidence` links the signature to the specific class it was signed for. `waiver_evidence_id` on `engagements` links the enrolment back to the exact evidence row.
- **Every enrolment requires a fresh signature** — there is no cross-enrolment reuse of prior evidence.

**Security and legal requirements (non-negotiable):**
- SHA-256 hash of wording snapshot at signing time (`consent_version_hash`).
- `waiver_evidence` rows are immutable — no UPDATE or DELETE; corrections append new rows/events only.
- Server-side timestamp (UTC), IP, user agent, and `Accept-Language` captured by Edge Function — not trusted from client alone.
- Idempotency token on submission endpoint prevents double-submit duplicates.
- All waiver lifecycle transitions written to `waiver_events` and `audit_log`.
- Retention policy for signed artifacts configured per tenant (minimum years per jurisdiction — legal counsel must approve).
- **Minor signer gate (server + client):** if the enrolled student is under 18 and the authenticated user's own `person_id` matches the student's `person_id`, `accept-waiver` returns 403 and the frontend shows a hard-block error. A minor cannot sign their own waiver.
- **Guardian confirmation required for minors:** `accept-waiver` returns 400 if the student is a minor and `guardian_confirmed !== true` in the request body. Enforced both server-side and in the UI.

**Legal defensibility controls:**

The self-hosted flow establishes evidential weight through the following controls, which together satisfy ESIGN/UETA (US) and Israeli electronic signature law:

- **Intent to sign** — explicit checkbox + typed full legal name required before submission. When signing for a minor, a second mandatory guardian-declaration checkbox must also be checked (`guardian_confirmed`).
- **Attribution** — authenticated Supabase JWT session (or validated WaiverToken for guest magic-link path); server-captured IP, user agent, and `Accept-Language` — client-supplied values are never trusted.
- **Non-repudiation** — SHA-256 of exact wording snapshot stored at signing time (`consent_version_hash`); independently reproducible from `wording_snapshot`.
- **Viewing confirmed (server-gated)** — `view_token` issued by `waiver-viewed` Edge Function only after server confirms scroll-to-bottom event; `accept-waiver` rejects any submission without a valid, non-expired token.
- **Tamper evidence** — immutability trigger at DB level (UPDATE/DELETE raise exception); HMAC-SHA256 (`record_hmac`) over 15 canonical evidence fields (see §4.2.9) using versioned secret key (`hmac_key_version`).
- **Retention** — `waiver-pdfs` private bucket with configurable retention policy (minimum years per jurisdiction — legal counsel must approve before production).
- **Audit chain** — `waiver_events` append-only log + `audit_log` entry with full actor/timestamp trail; exportable for dispute resolution.
- **Minor signer gate** — server rejects (403) any attempt by a minor to self-sign; frontend shows hard-block UI directing the user to log in as a parent/guardian.
- **Per-enrolment signature** — every new enrolment requires a fresh signature; prior evidence from another enrolment is never reused.

**`view_token` format (server-issued, client-opaque):**

```
base64url( HMAC-SHA256( WAIVER_HMAC_KEY_V{n}, "{person_id}:{template_id}:{unix_ts_seconds}" ) )
```

- Validated server-side by `accept-waiver`: recompute HMAC from stored fields, compare constant-time, reject if `unix_ts_seconds` is older than 900 s (15 minutes).
- The token is issued in the `waiver-viewed` response body; stored in React component state only (never localStorage or cookies).
- On expiry between scroll and submit, the client calls `waiver-viewed` again to obtain a fresh token; no full page reload required.

**`waiver-viewed` Edge Function contract:**

```
POST /functions/v1/waiver-viewed
Authorization: Bearer <supabase_jwt>
{ "person_id": "uuid", "consent_template_id": "uuid" }

200 OK
{ "view_token": "base64url...", "expires_at": "ISO-8601 UTC" }
```

Server writes a `viewed` row to `waiver_events` (with `waiver_evidence_id = NULL` until acceptance) and returns the token. Idempotent within the 15-minute window — repeated calls return a fresh token without duplicate events.

**Israeli law specifics (for dance/activity schools with minors):**

This system is designed for Israeli studios enrolling students aged 3+. Key Israeli law requirements that the waiver system is built to satisfy:

- **Minors cannot contract** (חוק הכשרות המשפטית והאפוטרופסות, 1962) — only a parent or legal guardian may sign. The system enforces this at both server and client level (`guardian_confirmed` field, minor-signer gate).
- **Electronic Signature Law** (חוק חתימה אלקטרונית, 2001) — a typed-name checkbox is a "basic" (non-secure) electronic signature. It is legally admissible but carries lower evidentiary weight than a certified electronic signature. The `waiver_require_otp` flag enables SMS OTP verification (Twilio Verify) to upgrade to a stronger proof of identity.
- **Standard Form Contracts** (חוק חוזים אחידים, 1982) — courts can void clauses deemed "oppressive" (`תנאי מקפח`), including blanket exclusions of gross negligence. The waiver text must be reviewed by legal counsel before activation.
- The system does **not** provide emergency medical treatment consent — this is a separate legal document outside V1 scope.

**Legal caveat:**
Tenant must obtain local legal counsel approval for waiver wording, consent UX, and retention policy **before production enablement**. This is mandatory regardless of jurisdiction.

**Deferred (V2+):**
- On-demand PDF export from admin panel (V1 uses DB evidence record as the operative legal artifact).
- Manual admin attestation + paper waiver upload for at-door edge cases (full plan exists — see §6 deferred).
- OTP enforcement for waiver signing (`waiver_require_otp` column and Twilio plumbing exist; UI enforcement and `verify-waiver-otp` Edge Function are V2).
- External e-sign vendor integration is permanently out of scope for this system.

---

## 3. Repository Structure

### 3.1 Monorepo

```
ballet-school-system/
├── apps/
│   └── web/                          # React/Vite frontend
├── packages/
│   └── shared/
│       └── src/
│           ├── database.types.ts     # Auto-generated by Supabase CLI — never hand-edit
│           ├── schemas/              # Zod schemas for forms and API data
│           ├── email-templates/      # React Email components
│           └── format/
│               ├── currency.ts       # Intl.NumberFormat with locale
│               ├── date.ts           # Intl.DateTimeFormat with locale
│               └── phone.ts          # Israeli phone number formatting
├── docs/
│   ├── deployment/
│   │   ├── THIRD_PARTY_SERVICES.md    # Twilio, Resend, Stripe setup
│   │   ├── ENVIRONMENTS.md            # Dev/staging/prod config (Phase 2)
│   │   └── TROUBLESHOOTING.md         # Common issues (Phase 2)
│   ├── IMPLEMENTATION_STATUS.md       # Living feature checklist
│   └── plans/
│       ├── README.md                  # Active plans index
│       ├── archive/                   # Shipped / superseded plans
│       └── …                          # See docs/plans/README.md
├── supabase/
│   ├── migrations/                    # 26 timestamped SQL files; see Section 4.2.0
│   │   ├── 20260608000200_core_tenants.sql
│   │   ├── 20260608000300_people.sql
│   │   ├── … (00200–02600; see 4.2.0)
│   │   └── 20260608002600_scheduled_jobs.sql
│   ├── migrations_backup/incremental_20260705/  # third squash archive (2026-07-05)
│   ├── migrations_backup/legacy_20260608/  # superseded pre-consolidation migrations
│   ├── reset_dev_db.sql               # Dev-only: drop schema + clear migration history
│   ├── scripts/                       # link-parent-user.sql, verify-seed.sql
│   ├── functions/
│   │   ├── stripe-webhook/
│   │   ├── create-payment-intent/
│   │   ├── send-notification/         # Routes to email, WhatsApp, or voice
│   │   ├── generate-sessions/
│   │   ├── ai-chatbot/
│   │   └── voice-handler/             # Twilio Voice webhook (V2)
│   └── seed.sql
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
└── .env.example
```

### 3.2 Frontend feature structure

```
src/
├── features/
│   ├── auth/
│   ├── enrolment/
│   │   ├── components/
│   │   │   ├── EnrolmentStepper.tsx
│   │   │   ├── ClassSelector.tsx      # Filtered by class requirements
│   │   │   └── CheckoutForm.tsx
│   │   ├── hooks/
│   │   │   ├── useEnrolment.ts
│   │   │   └── useAvailableClasses.ts # Applies requirement filtering
│   │   └── index.ts
│   ├── people/                        # Students + adult students unified
│   ├── families/
│   ├── classes/
│   ├── payments/
│   ├── expenses/                      # Admin expense tracking — V1
│   ├── communications/
│   ├── teachers/                      # V2.11 — admin CRUD + teacher portal; V1: staff table + service only
│   ├── schedule/
│   └── admin/
├── components/
│   └── ui/                            # shadcn/ui — do not hand-edit
├── lib/
│   ├── supabase.ts
│   ├── query-client.ts
│   └── utils.ts
├── hooks/
│   ├── useTenant.ts
│   └── useCurrentUser.ts
│   # useFeatureFlag.ts — planned V3.4 (not implemented)
├── i18n/
│   ├── he.json                        # Hebrew translations
│   ├── en.json                        # English translations
│   └── i18n.ts                        # i18next config
├── pages/
│   ├── admin/
│   ├── portal/                        # Parent + adult student portal
│   └── public/
└── router.tsx
```

### 3.3 RTL + i18n setup — do this on Day 1

```html
<!-- index.html — safe LTR default until LanguageProvider resolves language -->
<html lang="en" dir="ltr"></html>
```

```typescript
// DocumentLanguageSync (inside LanguageProvider) — sole owner of <html lang/dir>
useEffect(() => {
  document.documentElement.lang = language; // 'he' | 'en'
  document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
}, [language]);
// language = resolveLanguage(user?.language, tenant?.language_default) → default 'he'
```

Do **not** read `dir` or `locale` from the database for the document root. Locale for `Intl` formatting comes from `getLocale(language, country)` in `useTenant()`.

```typescript
// src/lib/format.ts — always use these, never inline Intl calls
export function formatCurrency(
  amountMinor: number,
  currency = "ILS",
  locale = "he-IL",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export function formatDate(
  date: Date | string,
  locale = "he-IL",
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...options,
  }).format(new Date(date));
}

export function formatPhone(phone: string): string {
  // Israeli phone normalisation: ensure +972 prefix
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return `+${digits}`;
  if (digits.startsWith("0")) return `+972${digits.slice(1)}`;
  return `+972${digits}`;
}
```

---

## 4. Database Schema

🔒 **SECURITY — Multi-Tenant Isolation:**
Every school-specific table MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id)`.

Default RLS for all non-super-admin users: `tenant_id = get_my_tenant_id()` plus role checks.

Three documented exceptions — all others are forbidden:
1. **`is_super_admin()` platform bypass** — platform owner only; see §4.1.
2. **Subdomain-scoped public reads** — via `SECURITY DEFINER` RPC only, never unfiltered views or `USING (true)`; see §4.1.1.
3. **`service_role` writes** — webhooks, OTP, payment inserts via Edge Functions; no user-facing INSERT policies.

🚫 **Forbidden:** `USING (true)` on any tenant-scoped table. Unfiltered views granted to `anon`. These are data breaches, not conveniences.

---

### 4.1 RLS Policy Pattern and Super-Admin Bypass

Every table uses **Row Level Security (RLS)** to enforce multi-tenant isolation and role-based access control.
All policies follow the same layered pattern:

1. **Super-admin bypass:** `is_super_admin()` returns `true` for `super_admin` role users. These users bypass all tenant checks globally (platform admin operations only).
2. **Tenant isolation:** Non-super-admins see data only from their own tenant (`tenant_id = get_my_tenant_id()`).
3. **Role filtering:** Within a tenant, access is further restricted by role (tenant_admin, teacher, parent, student).

⚠️ **`role` is `TEXT[]`** — always check with `'tenant_admin' = ANY(role)`, never with a scalar `get_my_role()` comparison. The helper `is_super_admin()` checks `'super_admin' = ANY(role)`.

This design enables:
- **Platform-level operations** (super-admin) without complex conditional logic
- **Guaranteed data isolation** — cross-tenant queries are impossible for non–super-admin users; anon access is subdomain-filtered only
- **Clear intent** — every policy explicitly states who can do what

**Example:** A `super_admin` sees all `families` rows across all tenants; a `tenant_admin` sees only families in their own tenant; a `parent` sees only their own family.

**Super-Admin Bypass Scope (Critical):** A `super_admin` role user bypasses ALL tenant checks entirely. They can read/write/delete data from any tenant without restriction. This is intentional for platform-level operations only (platform owner, customer support). Non-super-admin users (tenant_admin, teacher, parent, student) always see only their own tenant's data.

---

### 4.1.1 Public Access Model (Subdomain-Scoped)

Landing pages and public class listings need data before a user logs in. The access pattern is **always filtered by subdomain** — never a global table scan.

| Consumer | Mechanism | Implementation |
|----------|-----------|----------------|
| `anon` — branding, config | `get_tenant_config_by_subdomain(p_subdomain TEXT)` RPC | `SECURITY DEFINER`, returns one row for that subdomain only |
| `anon` — class catalog | `get_public_classes_by_subdomain(p_subdomain TEXT)` RPC | `SECURITY DEFINER`, filters `is_public = true AND status = 'active'` for that subdomain |
| `authenticated` users | Direct table `SELECT` with `tenant_id = get_my_tenant_id()` | Standard RLS; terms, levels, classes, waivers, etc. |
| OTP / rate limiting | Edge Function + `service_role` | No client policies on `otp_codes` or `verification_attempts` |

**Rules for public RPCs:**
- Must be `SECURITY DEFINER SET search_path = public`
- Must accept and validate `p_subdomain TEXT` — never return rows without filtering on it
- Must not expose encrypted columns (`stripe_secret_key_enc`, etc.) — use boolean presence flags instead
- `GRANT EXECUTE TO anon, authenticated`
- Direct `SELECT` on underlying tables by `anon` is forbidden

---

### 4.2 Database migrations

⏱️ **TIMING:** Third-party credentials (Twilio, Resend, Stripe) are configured **after** schema deploy via admin UI or manual runbook. See [Third-Party Services Setup](docs/deployment/THIRD_PARTY_SERVICES.md) and [docs/MANUAL_OPERATIONS_RUNBOOK.md](docs/MANUAL_OPERATIONS_RUNBOOK.md).

**Authoritative SQL:** `supabase/migrations/*.sql` — apply in filename order. **Dev-only schema edits:** change the original migration file (e.g. `001` for `tenants`), then reset — do not stack `ALTER` migrations while iterating locally (§2.5.3). Dev reset: `pnpm db:reset-local` or `supabase/reset_dev_db.sql` then `pnpm db:push`; run `supabase/seed.sql`; `pnpm db:types`; `pnpm email:bundle`.

#### 4.2.0 Implemented schema index (V1 slice)

- **2026-07-05 — third squash:** folded `20260625*`–`20260705*` incrementals into the base `20260608*` chain; archived originals under `supabase/migrations_backup/incremental_20260705/`.
- This index now reflects a single authoritative chain (`20260608000200`–`20260608002600`).

> **2026-06-08 — consolidated chain.** The original 34-file history (`20260526*`–`20260610*`) was rewritten into the `20260608*` chain below, baking every `ALTER` into its base `CREATE TABLE`. The superseded files are retained read-only under `supabase/migrations_backup/legacy_20260608/`. Filename order = apply order. **Base V1 chain: 26 files** (`00200`–`02600`, including `02150_waiver_rpcs`). **Post-chain scheduling / features:** `03000`–`04200` (feature flags, Google Calendar tokens, booking schema, `offering_type`, grants, hours RPC, pending_waiver occupancy) — see [scheduling/stage-s2-schema.md](docs/plans/scheduling/stage-s2-schema.md) and [deployment-and-testing.md](docs/plans/scheduling/deployment-and-testing.md).

> **2026-06-24 — second squash.** Seven post-consolidation incrementals (`20260609*`–`20260624*`) were folded into the base chain (encryption platform config, grow provisioning, enrolment resume drafts, offering location, waiver auth fix). Archived at `supabase/migrations_backup/incremental_20260624/`.

| File | Creates / updates | Depends on |
|------|-------------------|------------|
| `20260608000200_core_tenants.sql` | `tenants` (incl. `from_email`), `user_profiles`, `private.platform_config`, `get_app_encryption_key()`, RLS helpers (`get_my_tenant_id()`, `is_super_admin()`, `is_service_role()`) | — |
| `20260608000300_people.sql` | `people`, `accounts`, `account_members`, circular FK, `get_my_account_ids()`, `get_my_person_id()`, `is_minor()` | 000200 |
| `20260608000400_contact_prefs.sql` | `contact_preferences` | 000200, 000300 |
| `20260608000500_offerings.sql` | `seasons`, `categories`, `staff`, `offerings` (incl. `waiver_required`, `cover_image_path`, `location`) | 000200 |
| `20260608000600_communications.sql` | `notification_log`, `tenant_notification_templates`, `tenant_email_customizations`, `expense_categories`; notification blast RPCs; `idx_notification_log_dunning_key` | 000200, 000300 |
| `20260608000700_audit_security.sql` | `audit_log`, `otp_codes`, `verification_attempts` + cleanup/rate-limit RPCs | 000200 |
| `20260608000800_offering_sessions.sql` | `offering_sessions` | 000200, 000500 |
| `20260608000900_consent_templates.sql` | `consent_templates` + content-immutability trigger | 000200 |
| `20260608001000_requirements.sql` | `requirement_templates`, `requirement_overrides`, `offering_requirements` | 000200, 000300, 000500 |
| `20260608001100_billing_accounts.sql` | `billing_accounts` | 000200, 000300 |
| `20260608001200_waiver_evidence.sql` | `waiver_evidence` (incl. `offering_id`, `guardian_confirmed`), `waiver_events`, immutability triggers, RLS, `sign_waiver()` (26-param) | 000200, 000300, 000500, 000700, 000900 |
| `20260608001300_engagements.sql` | `engagements` (incl. age-override, waiver-deadline, `payment_dunning_*`, `waiver_evidence_id` FK), `waitlist`, `enrolment_resume_drafts` | 000200, 000300, 000500, 000800, 001100, 001200 |
| `20260608001400_attendance.sql` | `attendance`, `service_credits` | 000200, 000300, 000500, 000800, 001300 |
| `20260608001500_engagement_rls.sql` | engagement-dependent RLS on `offering_sessions` + `billing_accounts` | 000300, 000800, 001100, 001300 |
| `20260608001600_finance.sql` | `payments`, `expenses`, `grow_webhook_secrets`, credential RPCs (Grow/iCount + token invalidation), `get_finance_summary`, admin document RPCs, billing/invoicing tables | 000200, 000300, 000500, 001300, 001100 |
| `20260608001700_storage.sql` | `offering-images`, `waiver-pdfs`, `expense-receipts` buckets + storage RLS | 000200, 000300, 000500 |
| `20260608001800_public_rpcs.sql` | `get_public_offerings_by_subdomain(p_subdomain)` (incl. `season_start_date`, `cover_image_path`, `waiver_required`, `location`), `get_tenant_config_by_subdomain(p_subdomain)` — `anon` safe | 000200, 000500 |
| `20260608001900_auth_trigger.sql` | `handle_new_user` on `auth.users` (reads `raw_user_meta_data`, tenant fallback) | 000200 |
| `20260608002000_admin_rpcs.sql` | `get_my_profile()`, `link_auth_user_to_person()`, `get_tenant_today()`, `get_admin_dashboard_overview()`, `idx_offerings_season_dow_status` | 000200, 000300, 001300, 001600 |
| `20260608002100_guest_enrolment_rpcs.sql` | `guest_enrolment_*`, `engagement_age_at_season_start()`, guest age gate on create | 000300, 001100, 001300 |
| `20260608002150_waiver_rpcs.sql` | `get_pending_waiver_engagement()`, `get_engagement_person_id()` | 000300, 001300 |
| `20260608002200_admin_enrolment_rpcs.sql` | `search_enrolment_students()`, `admin_enrolment_lookup_email()`, guardian link RPCs, age-review RPCs | 000200, 000300, 001300 |
| `20260608002300_engagement_actions.sql` | `cancel_engagement()` (incl. `pending_waiver`) | 000200, 000700, 001300, 001600 |
| `20260608002400_tenant_provisioning.sql` | `check_subdomain_available()`, `provision_tenant()` (incl. `p_from_email`, IL grow defaults) | 000200, 000600 |
| `20260608002500_grants.sql` | Schema + table `GRANT`s for `authenticated` / `anon` / `service_role` (incl. `waiver_evidence`, `waiver_events`, `expenses`, `grow_webhook_secrets`) | all prior |
| `20260608002600_scheduled_jobs.sql` | `pg_cron` + `pg_net` extensions; scheduled HTTP jobs (billing, dunning, waiver, issue-document) + SQL cleanup RPCs | 000700, Edge fn auth via GUCs |

> **RLS fixes applied in-place** in all files listed above. See §4.1 and §4.1.1 for the security model these migrations implement.

Sections **4.2.1–4.2.8** below document the **implemented V1 shape**. The subsection numbering is legacy (blueprint era) — authoritative filenames are in the index above. Older blueprint tables (`discount_rules`, platform `plan` on tenants, etc.) remain in the long-term design notes where marked **Deferred**. The **`expenses`** table is implemented in `20260608001600_finance.sql` (third squash, 2026-07-05).

#### 4.2.1 Migration 001 — Tenants and user profiles

> **Ordering:** `tenants` is created first, then `user_profiles` references `tenants(id)`.
> Later tables reference `user_profiles` via `user_profile_id`.
> **`dir` and `locale` are not columns** — direction and locale strings are computed in the app.
> **`role` is `TEXT[]`** — a user can hold multiple roles. Always check with `'tenant_admin' = ANY(role)`, never with scalar equality.
> **`is_service_role()` helper** is also defined in migration 001 (alongside `get_my_tenant_id()` etc.) so it can be used in later migrations.

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE tenants (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT        NOT NULL,
  subdomain                 TEXT        NOT NULL UNIQUE,
  language_default          TEXT        NOT NULL DEFAULT 'he' CHECK (language_default IN ('he', 'en')),
  country                   TEXT        NOT NULL DEFAULT 'IL' CHECK (country IN ('IL', 'US')),
  primary_color             TEXT        NOT NULL DEFAULT '#76335a',
  accent_color              TEXT        NOT NULL DEFAULT '#e99ac4',
  currency                  TEXT        NOT NULL DEFAULT 'ILS',
  vat_rate                  NUMERIC(5,4) DEFAULT 0.17,
  prices_include_vat        BOOLEAN     NOT NULL DEFAULT true,  -- see §2.5.1
  phone_region              TEXT        NOT NULL DEFAULT 'IL',
  phone_region_updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Stripe (Standard account per school; Connect deferred)
  stripe_publishable_key    TEXT,
  stripe_secret_key_enc     BYTEA,       -- pgp_sym_encrypt; key from app.encryption_key
  stripe_webhook_secret_enc BYTEA,
  stripe_account_id         TEXT,        -- nullable; future Connect
  stripe_credentials_updated_at TIMESTAMPTZ,
  -- Waiver
  waiver_require_otp        BOOLEAN     NOT NULL DEFAULT false,  -- if true, Twilio Verify OTP required before waiver acceptance; see §2.7.1
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  role          TEXT[]      NOT NULL DEFAULT ARRAY['parent'],
  person_id     UUID,
  email         TEXT,
  language      TEXT CHECK (language IN ('he', 'en')),  -- NULL → use tenant.language_default
  country       TEXT CHECK (country IN ('IL', 'US')),     -- NULL → use tenant.country
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Deferred on `tenants` (V2/V3 blueprint, not in V1 migration):** `custom_domain`, `logo_url`, `entity_label_*`, `plan`, Resend/Twilio columns, `vat_registered` / `vat_number`, `external_invoice_provider` (e.g. `morning` / `green_invoice`).

#### 4.2.2 Migration 002 — People and families

> **Design note:** One `people` row per student/adult. `family_id` nullable for solo adults.
> **`is_minor` is not a DB column** — computed in app/Zod from `date_of_birth` via `is_minor()` SQL helper or client logic.

```sql
CREATE TABLE families (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  primary_contact_id    UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE family_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  family_id        UUID NOT NULL REFERENCES families(id),
  user_profile_id  UUID REFERENCES user_profiles(id),
  name             TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  role             TEXT NOT NULL DEFAULT 'guardian',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE people (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id),
  user_profile_id          UUID REFERENCES user_profiles(id),
  family_id                UUID REFERENCES families(id),
  name                     TEXT NOT NULL,
  email                    TEXT,
  date_of_birth            DATE,
  medical_notes            TEXT,
  allergies                TEXT,
  emergency_contact_name   TEXT,
  emergency_contact_phone  TEXT,
  photo_consent            BOOLEAN NOT NULL DEFAULT false,
  media_consent            BOOLEAN NOT NULL DEFAULT false,
  status                   TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'inactive', 'withdrawn')),
  waiver_accepted_at       TIMESTAMPTZ,
  waiver_version           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 4.2.3 Migration 003 — Contact preferences

> **File:** `20260608000400_contact_prefs.sql`
>
> **Design note:** Communication targets are people and family_members, not families.
> Every human with a phone has their own preferences. A 16-year-old wants to know
> their class is cancelled — they don't need their parent involved.
> Adult students manage their own preferences entirely.
>
> **All five `notify_*` columns ship in this migration**, including `notify_waiting_list` and `notify_school_announcements`. Do not add them again in a separate migration.

```sql
CREATE TABLE contact_preferences (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id),

  -- Owner of these preferences: one of the following must be set
  person_id           UUID        REFERENCES people(id),          -- for enrolled people
  family_member_id    UUID        REFERENCES family_members(id),  -- for parents/guardians

  -- Channel availability (opt-in per channel)
  email               TEXT,
  email_opted_in      BOOLEAN     NOT NULL DEFAULT true,          -- email is default on

  whatsapp_number     TEXT,
  whatsapp_opted_in   BOOLEAN     NOT NULL DEFAULT false,
  whatsapp_verified   BOOLEAN     NOT NULL DEFAULT false,         -- number verified via OTP

  voice_number        TEXT,
  voice_opted_in      BOOLEAN     NOT NULL DEFAULT false,

  -- Notification scope: which events trigger notifications for this person
  notify_class_cancellation  BOOLEAN NOT NULL DEFAULT true,
  notify_payment_due         BOOLEAN NOT NULL DEFAULT true,
  notify_waiting_list        BOOLEAN NOT NULL DEFAULT true,
  notify_schedule_change     BOOLEAN NOT NULL DEFAULT true,
  notify_school_announcements BOOLEAN NOT NULL DEFAULT true,

  preferred_channel   TEXT        NOT NULL DEFAULT 'email'
                      CHECK (preferred_channel IN ('email','whatsapp','voice')),

  language            TEXT        NOT NULL DEFAULT 'he',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Exactly one of person_id or family_member_id must be set
  CONSTRAINT contact_owner CHECK (
    (person_id IS NOT NULL AND family_member_id IS NULL) OR
    (person_id IS NULL AND family_member_id IS NOT NULL)
  )
);
```

#### 4.2.4 Migration 004 — Terms, levels, and classes

> **File:** `20260608000500_offerings.sql`. **`offering_sessions`** is in `20260608000800_offering_sessions.sql` (separate migration).
>
> **Public access:** `anon` users MUST NOT read `terms`, `levels`, or `classes` directly. Public class listings are served by the `get_public_classes_by_subdomain(p_subdomain)` RPC (migration 015). Authenticated users read these tables directly — RLS filters to their own tenant.

```sql
CREATE TABLE terms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'upcoming'
              CHECK (status IN ('upcoming', 'active', 'completed', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE levels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE classes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  term_id           UUID NOT NULL REFERENCES terms(id),
  level_id          UUID REFERENCES levels(id),
  name              TEXT NOT NULL,
  day_of_week       INT CHECK (day_of_week BETWEEN 0 AND 6),
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  max_capacity      INT NOT NULL DEFAULT 15,
  price_minor       INT NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'ILS',
  vat_rate          NUMERIC(5,4),
  is_public         BOOLEAN NOT NULL DEFAULT true,
  billing_frequency VARCHAR(50) NOT NULL DEFAULT 'monthly',
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'cancelled', 'full')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 4.2.5 Class requirements (implemented — not inline enum on `classes`)

> **Age bands (V1 implementation):** `offerings.min_age` / `offerings.max_age` are first-class columns (not requirement templates). Age is evaluated at **season start**, not today's date. Parents/guests are hard-blocked; admins may override with audit trail (`age_override_*` on `engagements`); parents may request studio review → `admin_review` engagement + admin email. **Status (2026-06-28):** PR A + PR B ✅ complete on `feat/UI-fixes`. Manual E2E smoke recommended before prod. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

> **`offerings.location` (V1):** Optional nullable `TEXT` (max 500 chars) — human-readable display text for where the class meets (room name, address, or directions). Not a normalized address, geocode, or venue FK. Included in `get_public_offerings_by_subdomain` for public listings; shown in admin, parent portal, enrolment UI, and enrolment confirmation email when set.

> **Legacy blueprint numbering** — see §4.2.0 for authoritative filenames. The full `expenses` table is included in V1 (not deferred).
> **Files:** `20260608001000_requirements.sql` (templates, overrides, offering links).
> Replaces the older single-table `class_requirements` with `requirement_type` CHECK from the blueprint below.

#### Migration 005 — Class requirements (blueprint reference)

> **Design note:** Age is just one possible constraint. This table supports any requirement type
> with custom enforcement logic per type. Auto-enforceable requirements block at enrolment.
> Review-required requirements flag the admin but allow enrolment.

```sql
CREATE TABLE class_requirements (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID    NOT NULL REFERENCES tenants(id),
  class_id        UUID    NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  requirement_type TEXT   NOT NULL
                  CHECK (requirement_type IN (
                    'min_age',          -- person.date_of_birth check
                    'max_age',          -- person.date_of_birth check
                    'min_experience_years', -- from enrolment question
                    'prerequisite_class',   -- must have completed another class
                    'admin_approval',       -- admin must approve before activation
                    'equipment_required',   -- informational + confirmation checkbox
                    'gender',               -- some classes may be gender-specific
                    'custom'                -- free-text shown at enrolment
                  )),
  value           TEXT    NOT NULL,  -- '6' for min_age, class UUID for prerequisite, etc.
  display_text    TEXT    NOT NULL,  -- shown to parent: "This class is for ages 6 and up"
  is_hard_block   BOOLEAN NOT NULL DEFAULT true,
  -- true = blocks enrolment if not met
  -- false = flags for admin review but allows enrolment to proceed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Example seed data for a ballet school:
-- INSERT INTO class_requirements (class_id, requirement_type, value, display_text, is_hard_block)
-- VALUES
--   (grade3_class_id, 'min_age', '7', 'This class is for students aged 7 and above', true),
--   (pointe_class_id, 'prerequisite_class', grade5_class_id, 'Students must have completed Grade 5', true),
--   (adult_class_id, 'min_age', '16', 'Adult class — 16 years and above', true),
--   (audition_class_id, 'admin_approval', 'true', 'Acceptance to this class requires teacher approval', false);
```

```typescript
// src/features/enrolment/lib/check-requirements.ts
// Pure function — unit testable

export type RequirementCheckResult = {
  passed: boolean;
  blocked: boolean; // hard block: cannot enrol
  flagged: boolean; // soft flag: admin must review
  messages: string[]; // display to parent
};

export function checkClassRequirements(
  requirements: ClassRequirement[],
  person: Person,
): RequirementCheckResult {
  const messages: string[] = [];
  let blocked = false;
  let flagged = false;

  for (const req of requirements) {
    const met = evaluateRequirement(req, person);
    if (!met) {
      messages.push(req.display_text);
      if (req.is_hard_block) blocked = true;
      else flagged = true;
    }
  }

  return { passed: !blocked && !flagged, blocked, flagged, messages };
}

// Union type mirrors the DB CHECK constraint exactly.
// TypeScript will error here if a new requirement_type is added to the DB
// without adding a corresponding case — catching the omission at compile time.
type RequirementType =
  | "min_age"
  | "max_age"
  | "min_experience_years"
  | "prerequisite_class"
  | "admin_approval"
  | "equipment_required"
  | "gender"
  | "custom";

function evaluateRequirement(req: ClassRequirement, person: Person): boolean {
  const type = req.requirement_type as RequirementType;

  switch (type) {
    case "min_age": {
      if (!person.date_of_birth) return false;
      const age = getAgeInYears(person.date_of_birth);
      return age >= parseInt(req.value);
    }
    case "max_age": {
      if (!person.date_of_birth) return true; // benefit of doubt for adults
      const age = getAgeInYears(person.date_of_birth);
      return age <= parseInt(req.value);
    }
    case "admin_approval":
      // Always returns false — forces admin_review enrolment status.
      // Admin must manually approve before enrolment activates.
      return false;
    case "equipment_required":
      // Informational only — parent sees the display_text, no automatic block.
      return true;
    case "prerequisite_class":
      // Cannot be evaluated client-side (requires DB query for completion history).
      // Returns false here; Edge Function performs the real check on submission.
      // is_hard_block on the requirement row controls whether this blocks or flags.
      return false;
    case "min_experience_years":
      // Evaluated from prior_experience free-text field — admin review only.
      // No automatic numeric check; admin sees the flagged enrolment.
      return false;
    case "gender":
      // ⚠️ LEGAL NOTE: Israeli anti-discrimination law (חוק שוויון הזדמנויות בעבודה)
      // limits gender-based restrictions. Consult a lawyer before enabling this
      // requirement type for any class. Benefit of doubt if gender not specified.
      if (!person.gender) return true;
      return person.gender === req.value;
    case "custom":
      // Free-text requirements always flag for admin review — no automatic logic.
      return false;
    default: {
      // Exhaustive check: this line causes a TypeScript compile error if any
      // RequirementType value is not handled above. Never remove this.
      const _exhaustiveCheck: never = type;
      // At runtime: unknown type — fail safe (block enrolment, flag for admin).
      console.error(`Unknown requirement type encountered: ${String(_exhaustiveCheck)}`);
      return false;
    }
  }
}
```

#### 4.2.6 Migration 006 — Enrolments and waiting list

> **Legacy blueprint numbering** — see §4.2.0 for authoritative filenames.
> **Files:** `20260608001300_engagements.sql` (`engagements` + `waitlist`).
> **`waiting_list` is a separate table** — do not store `waiting_list` as an `enrolments.status` value.

```sql
CREATE TABLE enrolments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  person_id             UUID NOT NULL REFERENCES people(id),
  class_id              UUID NOT NULL REFERENCES classes(id),
  term_id               UUID NOT NULL REFERENCES terms(id),
  billing_account_id    UUID REFERENCES billing_accounts(id),
  status                TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'active', 'admin_review', 'pending_offer', 'cancelled', 'withdrawn')),
  payment_received_at   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_enrolments_active_unique
  ON enrolments(person_id, class_id, term_id) WHERE status NOT IN ('cancelled', 'withdrawn');

CREATE TABLE waiting_list (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  class_id    UUID NOT NULL REFERENCES classes(id),
  person_id   UUID NOT NULL REFERENCES people(id),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, person_id)
);
-- Position: ROW_NUMBER() OVER (PARTITION BY class_id ORDER BY added_at)
```

#### 4.2.7 Migration 007 — Attendance

> **Legacy blueprint numbering** — see §4.2.0 for authoritative filenames.
> **File:** `20260608001400_attendance.sql` — uses `attended BOOLEAN`, not a `status` enum.

```sql
CREATE TABLE attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  session_id  UUID NOT NULL REFERENCES class_sessions(id),
  person_id   UUID NOT NULL REFERENCES people(id),
  attended    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, person_id)
);

CREATE TABLE makeup_credits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id),
  person_id          UUID NOT NULL REFERENCES people(id),
  class_id           UUID NOT NULL REFERENCES classes(id),
  credit_type        TEXT NOT NULL DEFAULT 'makeup',
  sessions_remaining INT NOT NULL DEFAULT 1,
  expires_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 4.2.8 Migration 008 — Payments and finance (V1 slice)

> **Legacy blueprint numbering** — see §4.2.0 for authoritative filenames.
> **File:** `20260608001600_finance.sql`.

```sql
CREATE TABLE payments (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID        NOT NULL REFERENCES tenants(id),
  family_id                  UUID        REFERENCES families(id),  -- nullable for adult solo payers
  person_id                  UUID        REFERENCES people(id),    -- direct link for adult students
  enrolment_id               UUID        REFERENCES enrolments(id),
  stripe_payment_intent_id   TEXT        UNIQUE,
  stripe_invoice_id          TEXT,

  -- Amounts (all in minor currency units)
  pretax_amount_minor        INT         NOT NULL,
  vat_rate                   NUMERIC(5,4) NOT NULL DEFAULT 0,
  vat_amount_minor           INT         NOT NULL DEFAULT 0,
  total_amount_minor         INT         NOT NULL,  -- pretax + vat
  currency                   TEXT        NOT NULL DEFAULT 'ILS',

  -- Invoice (Israeli legal requirement) — unique per tenant, not globally
  invoice_number             TEXT,
  invoice_issued_at          TIMESTAMPTZ,
  invoice_url                TEXT,        -- Supabase Storage PDF or Green Invoice URL
  UNIQUE (tenant_id, invoice_number),

  status                     TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','succeeded','failed','refunded','disputed')),
  description                TEXT,
  paid_at                    TIMESTAMPTZ,
  refunded_at                TIMESTAMPTZ,
  refund_amount_minor        INT,

  -- Data retention: never delete, only anonymise
  anonymised_at              TIMESTAMPTZ,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraint: payments must be linked to either a family (for minors) or a person (for adults)
  CONSTRAINT payment_payer CHECK ((family_id IS NOT NULL) OR (person_id IS NOT NULL))
);

✅ **Cross-reference:** Payment state machine logic and webhook handling is detailed in [Phase 1E — Payments](#phase-1e--payments-days-2734).

**V1 finance migration file:** `20260608001600_finance.sql` also defines `invoice_sequences`, `next_invoice_number()`, `get_tenant_stripe_credentials()`, `save_tenant_stripe_credentials()`. Stripe secrets use `BYTEA` + `pgcrypto` and `current_setting('app.encryption_key')` (set via manual runbook). Webhook/Edge inserts use `service_role` (bypasses RLS).

**Deferred past first finance slice** (see [§6.x](#6x--deferred-backlog-postv1-payment-slice)):

```sql
-- NOT in V1 migrations — blueprint only:
CREATE TABLE discount_rules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  name            TEXT        NOT NULL,
  type            TEXT        NOT NULL
                  CHECK (type IN ('family_multi','promo_code','loyalty','early_bird','manual')),
  code            TEXT,                      -- uppercase, for promo_code type
  discount_type   TEXT        NOT NULL DEFAULT 'percentage'
                  CHECK (discount_type IN ('percentage','fixed')),
  discount_value  INT         NOT NULL,
  max_uses        INT,
  uses_count      INT         NOT NULL DEFAULT 0,
  valid_from      DATE,
  valid_until     DATE,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teacher_pay_records (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  teacher_id       UUID        NOT NULL REFERENCES user_profiles(id),
  teacher_type     TEXT        NOT NULL DEFAULT 'contractor'
                   CHECK (teacher_type IN ('contractor','employee')),
  term_id          UUID        REFERENCES terms(id),
  period_start     DATE        NOT NULL,
  period_end       DATE        NOT NULL,
  hours_worked     NUMERIC(6,2),
  hourly_rate_minor INT,
  total_minor      INT         NOT NULL,
  pretax_minor     INT,
  vat_minor        INT,
  currency         TEXT        NOT NULL DEFAULT 'ILS',
  contractor_invoice_number TEXT,  -- teacher's own invoice number (for contractors)
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','paid')),
  paid_at          TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 4.2.9 Migration — Waiver evidence (V1 planned)

> **File:** `20260608001200_waiver_evidence.sql`  
> **Depends on:** `20260608000300_people.sql`, `20260608000500_offerings.sql`, `20260608000700_audit_security.sql`, `20260608000900_consent_templates.sql`  
> **See also:** §2.7.1 Self-Hosted Waiver Evidence, §6 Waiver lifecycle and enrolment gate

Immutable signed-waiver records and append-only lifecycle events. `people.waiver_accepted_at` / `people.waiver_version` remain denormalized pointers to the latest valid evidence row.

```sql
CREATE TABLE waiver_evidence (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  person_id             UUID        NOT NULL REFERENCES people(id),
  family_member_id      UUID        REFERENCES family_members(id),  -- signer when guardian
  consent_template_id   UUID        NOT NULL REFERENCES consent_templates(id),
  consent_version       INT         NOT NULL,
  consent_version_hash  VARCHAR(64) NOT NULL,  -- SHA-256 of wording_snapshot
  wording_snapshot      TEXT        NOT NULL,  -- exact legal text accepted
  pdf_storage_path      TEXT        NOT NULL,  -- private bucket path
  pdf_sha256            VARCHAR(64) NOT NULL,  -- SHA-256 of rendered PDF bytes
  record_hmac           VARCHAR(64) NOT NULL,  -- HMAC-SHA256 over canonical evidence JSON (see §2.7.1)
  hmac_key_version      SMALLINT    NOT NULL DEFAULT 1,  -- matches WAIVER_HMAC_CURRENT_VERSION secret
  viewed_at             TIMESTAMPTZ,           -- server timestamp from waiver-viewed Edge Function; NULL until scroll confirmed
  signed_by_name        TEXT        NOT NULL,
  signed_by_email       TEXT,
  signed_by_role        TEXT        NOT NULL DEFAULT 'guardian'
                        CHECK (signed_by_role IN ('guardian', 'self', 'admin_attestation')),
  signature_method      TEXT        NOT NULL DEFAULT 'typed_name_checkbox'
                        CHECK (signature_method IN ('typed_name_checkbox', 'admin_upload')),
  signed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address            INET,
  user_agent            TEXT,
  accept_language       TEXT,
  idempotency_key       TEXT        NOT NULL,
  otp_verify_sid        TEXT,                  -- Twilio Verify SID; NULL when waiver_require_otp = false
  status                TEXT        NOT NULL DEFAULT 'signed'
                        CHECK (status IN ('signed', 'superseded', 'revoked')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE waiver_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id),
  -- NULL for 'viewed' events that precede evidence creation; NOT NULL for all others
  waiver_evidence_id  UUID        REFERENCES waiver_evidence(id),
  event_type          TEXT        NOT NULL
                      CHECK (event_type IN (
                        'requested', 'viewed', 'accepted', 'superseded', 'revoked', 'admin_attested'
                      )),
  actor_user_id       UUID        REFERENCES user_profiles(id),
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutability: signed evidence cannot be updated or deleted
CREATE OR REPLACE FUNCTION prevent_waiver_evidence_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'waiver_evidence rows are immutable';
END;
$$;

CREATE TRIGGER waiver_evidence_immutable
  BEFORE UPDATE ON waiver_evidence
  FOR EACH ROW EXECUTE FUNCTION prevent_waiver_evidence_update();

CREATE TRIGGER waiver_evidence_no_delete
  BEFORE DELETE ON waiver_evidence
  FOR EACH ROW EXECUTE FUNCTION prevent_waiver_evidence_update();
```

**HMAC canonical JSON specification:**

`record_hmac` is `HMAC-SHA256( WAIVER_HMAC_KEY_V{hmac_key_version}, canonical_json )` where `canonical_json` is a JSON object with keys in **alphabetical order**, no whitespace, containing exactly these **15 fields**:

```json
{
  "accept_language": "<string|null>",
  "consent_template_id": "<uuid>",
  "consent_version": <int>,
  "consent_version_hash": "<hex64>",
  "guardian_confirmed": <boolean>,
  "idempotency_key": "<string>",
  "ip_address": "<string|null>",
  "pdf_sha256": "<hex64>",
  "person_id": "<uuid>",
  "signed_at": "<ISO-8601 UTC, e.g. 2026-06-04T09:00:00.000Z>",
  "signed_by_email": "<string|null>",
  "signed_by_name": "<string>",
  "signed_by_role": "<string>",
  "tenant_id": "<uuid>",
  "user_agent": "<string|null>"
}
```

> **Important:** `guardian_confirmed` is `false` for adult self-signers and `true` when a guardian has explicitly checked the parental-authority declaration. Its alphabetical position (between `consent_version_hash` and `idempotency_key`) is fixed — the field ordering must not change or all HMAC verifications will fail.

`null` JSON values are used verbatim for nullable fields when absent. Output is lowercase hex (64 chars). The HMAC is computed in the `accept-waiver` Edge Function (not inside the RPC) using the `WAIVER_HMAC_KEY_V{n}` Supabase secret. The versioned key is referenced by `hmac_key_version` stored on the evidence row, enabling key rotation without invalidating older records.

**`people.waiver_version` value format:**

Set to `consent_version::TEXT` (e.g. `'3'` for version 3) — the integer version number of the accepted template cast to text. Used as a quick denormalized pointer; the authoritative record is always the `waiver_evidence` row.

**Atomic write via `sign_waiver()` RPC:**

All writes happen inside a single `SECURITY DEFINER` PostgreSQL function called from the Edge Function via `supabase.rpc('sign_waiver', payload)`. This guarantees true DB-level atomicity — no partial state on network errors.

```sql
-- Actual live signature (26 params). Called exclusively from the accept-waiver Edge Function.
-- REVOKE/GRANT must use the full parameter type list to avoid ambiguity.
CREATE OR REPLACE FUNCTION sign_waiver(
  p_id                    UUID,          -- pre-generated by Edge Function (crypto.randomUUID())
  p_tenant_id             UUID,
  p_person_id             UUID,
  p_account_member_id     UUID,          -- account_members.id; NULL for adult self-signers
  p_consent_template_id   UUID,
  p_consent_version       INT,
  p_consent_version_hash  TEXT,
  p_wording_snapshot      TEXT,
  p_pdf_storage_path      TEXT,          -- 'v1-deferred' sentinel in V1
  p_pdf_sha256            TEXT,          -- '000...0' sentinel in V1
  p_record_hmac           TEXT,          -- 15-field canonical HMAC (see §4.2.9)
  p_hmac_key_version      SMALLINT,
  p_viewed_at             TIMESTAMPTZ,
  p_signed_by_name        TEXT,
  p_signed_by_email       TEXT,
  p_signed_by_role        TEXT,          -- 'self' | 'guardian' | 'admin_attestation'
  p_signature_method      TEXT,          -- 'typed_name_checkbox' | 'admin_upload'
  p_signed_at             TIMESTAMPTZ,
  p_ip_address            INET,
  p_user_agent            TEXT,
  p_accept_language       TEXT,
  p_idempotency_key       TEXT,
  p_otp_verify_sid        TEXT,          -- Twilio Verify SID; NULL when waiver_require_otp = false
  p_actor_id              UUID,          -- auth.uid() of the signing user; NULL for guests
  p_offering_id           UUID DEFAULT NULL,      -- class this waiver was signed for
  p_guardian_confirmed    BOOLEAN DEFAULT false   -- true when guardian declaration was checked
)
RETURNS UUID  -- waiver_evidence.id
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_evidence_id UUID;
BEGIN
  -- Idempotency: ON CONFLICT DO NOTHING makes this safe under concurrent retries
  INSERT INTO waiver_evidence (
    id, tenant_id, person_id, account_member_id,
    consent_template_id, consent_version, consent_version_hash, wording_snapshot,
    pdf_storage_path, pdf_sha256, record_hmac, hmac_key_version, viewed_at,
    signed_by_name, signed_by_email, signed_by_role, signature_method,
    signed_at, ip_address, user_agent, accept_language,
    idempotency_key, otp_verify_sid, status, offering_id, guardian_confirmed
  ) VALUES (
    p_id, p_tenant_id, p_person_id, p_account_member_id,
    p_consent_template_id, p_consent_version, p_consent_version_hash, p_wording_snapshot,
    p_pdf_storage_path, p_pdf_sha256, p_record_hmac, p_hmac_key_version, p_viewed_at,
    p_signed_by_name, p_signed_by_email, p_signed_by_role, p_signature_method,
    p_signed_at, p_ip_address, p_user_agent, p_accept_language,
    p_idempotency_key, p_otp_verify_sid, 'signed', p_offering_id, p_guardian_confirmed
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_evidence_id;

  IF v_evidence_id IS NULL THEN
    SELECT id INTO v_evidence_id FROM waiver_evidence
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
    RETURN v_evidence_id;
  END IF;

  INSERT INTO waiver_events (tenant_id, waiver_evidence_id, event_type, actor_id, metadata)
  VALUES (p_tenant_id, v_evidence_id, 'accepted', p_actor_id,
          jsonb_build_object('ip', p_ip_address::TEXT, 'consent_version', p_consent_version,
                             'offering_id', p_offering_id::TEXT, 'guardian_confirmed', p_guardian_confirmed));

  INSERT INTO audit_log (tenant_id, actor_id, actor_email, action, entity_type, entity_id,
                         ip_address, user_agent, after_state)
  VALUES (p_tenant_id, p_actor_id, p_signed_by_email, 'waiver_signed', 'waiver_evidence',
          v_evidence_id, p_ip_address, p_user_agent,
          jsonb_build_object('person_id', p_person_id, 'consent_version', p_consent_version,
                             'consent_template_id', p_consent_template_id,
                             'offering_id', p_offering_id, 'guardian_confirmed', p_guardian_confirmed));

  UPDATE people
  SET waiver_accepted_at = p_signed_at,
      waiver_version     = p_consent_version::TEXT,
      updated_at         = now()
  WHERE id = p_person_id AND tenant_id = p_tenant_id;

  RETURN v_evidence_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION sign_waiver(
  UUID,UUID,UUID,UUID,UUID,INT,TEXT,TEXT,TEXT,TEXT,TEXT,
  SMALLINT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,
  INET,TEXT,TEXT,TEXT,TEXT,UUID,UUID,BOOLEAN
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION sign_waiver(
  UUID,UUID,UUID,UUID,UUID,INT,TEXT,TEXT,TEXT,TEXT,TEXT,
  SMALLINT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,
  INET,TEXT,TEXT,TEXT,TEXT,UUID,UUID,BOOLEAN
) TO service_role;
```

**RLS policies for `waiver_evidence` and `waiver_events`:**

```sql
-- Enable RLS
ALTER TABLE waiver_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiver_events   ENABLE ROW LEVEL SECURITY;

-- waiver_evidence: SELECT — own tenant (admin all rows, parent/student own person only)
CREATE POLICY waiver_evidence_select ON waiver_evidence FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_service_role()
      OR 'tenant_admin' = ANY((SELECT role FROM user_profiles WHERE id = auth.uid()))
      OR person_id IN (
        SELECT id FROM people WHERE tenant_id = get_my_tenant_id()
          AND (id = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
               OR family_id IN (
                 SELECT family_id FROM people WHERE id = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
               ))
      )
    )
  );

-- waiver_evidence: INSERT — service_role ONLY (via sign_waiver RPC called by Edge Function)
-- Direct client INSERT is intentionally blocked; the Edge Function owns all writes.
CREATE POLICY waiver_evidence_insert ON waiver_evidence FOR INSERT
  WITH CHECK (is_service_role());

-- waiver_events: SELECT — same scoping as waiver_evidence
CREATE POLICY waiver_events_select ON waiver_events FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_service_role()
      OR 'tenant_admin' = ANY((SELECT role FROM user_profiles WHERE id = auth.uid()))
      OR waiver_evidence_id IN (
        SELECT id FROM waiver_evidence WHERE person_id IN (
          SELECT id FROM people WHERE tenant_id = get_my_tenant_id()
            AND (id = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
                 OR family_id IN (
                   SELECT family_id FROM people WHERE id = (SELECT person_id FROM user_profiles WHERE id = auth.uid())
                 ))
        )
      )
      OR waiver_evidence_id IS NULL  -- 'viewed' events before evidence creation; scoped by tenant_id above
    )
  );

-- waiver_events: INSERT — service_role ONLY
CREATE POLICY waiver_events_insert ON waiver_events FOR INSERT
  WITH CHECK (is_service_role());
```

**Storage bucket:** `waiver-pdfs` — private, tenant-scoped paths `{tenant_id}/{person_id}/{evidence_id}.pdf`. Retrieval via short-lived signed URLs (`createSignedUrl`, 60-second expiry) called from the Edge Function after RLS authorization check. No direct client access to the bucket.

#### Migration 009 — Expenses

> **V1 repo status:** `expense_categories` in `20260608000600_communications.sql`; full **`expenses`** table + `create_expense` RPC in **`20260608001600_finance.sql`** (folded 2026-07-05). Admin P&L UI shipped — see [admin-dashboard-finance](docs/plans/admin-dashboard-finance/00-overview.md).

> **Required in V1.** Without this table you have no P&L and cannot calculate profit.
> Your accountant needs both sides from day one.
>
> **Design note (Issue #9 fix):** `category_id` references `expense_categories` (Migration 014)
> instead of a hardcoded CHECK constraint. This means Migration 014 must run before expense
> rows are inserted, but the table itself can be created here. Both tables are created before
> any data is written, so the FK is valid from first use.
> Seed default categories for your tenant after running Migration 014.

```sql
CREATE TABLE expenses (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  -- category_id references expense_categories (defined in Migration 014).
  -- NULL temporarily allowed so this table can be created before Migration 014 runs;
  -- application code must always supply a valid category_id.
  category_id           UUID,
  description           TEXT        NOT NULL,
  pretax_amount_minor   INT         NOT NULL,
  vat_amount_minor      INT         NOT NULL DEFAULT 0,
  total_amount_minor    INT         NOT NULL,
  currency              TEXT        NOT NULL DEFAULT 'ILS',
  supplier_name         TEXT,
  supplier_vat_number   TEXT,       -- for VAT reclaim
  receipt_url           TEXT,       -- Supabase Storage
  expense_date          DATE        NOT NULL,
  created_by            UUID        REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
  -- FK to expense_categories added in Migration 014 after that table exists:
  -- ALTER TABLE expenses ADD CONSTRAINT expenses_category_fk
  --   FOREIGN KEY (tenant_id, category_id)
  --   REFERENCES expense_categories(tenant_id, id);
);
```

#### Migration 010 — Invoice sequences

> **V1 implemented in:** `20260608001600_finance.sql` (with `payments` table).

> **Israeli legal requirement.** Invoice numbers must be sequential and gapless.
> This atomic function prevents gaps under concurrent payments.

```sql
CREATE TABLE invoice_sequences (
  tenant_id      UUID    PRIMARY KEY REFERENCES tenants(id),
  last_number    INT     NOT NULL DEFAULT 0,
  prefix         TEXT    NOT NULL DEFAULT 'INV',
  year_prefix    BOOLEAN NOT NULL DEFAULT true,  -- INV-2025-0001 format
  current_year   TEXT    NOT NULL DEFAULT EXTRACT(YEAR FROM now())::TEXT
  -- current_year tracks which year last_number belongs to.
  -- When next_invoice_number() detects a new year, it resets last_number to 0.
  -- This is the correct fix for the year-boundary bug: without this column,
  -- the first invoice of a new year would continue from last year's sequence
  -- (e.g. INV-2026-0847 instead of INV-2026-0001), violating Israeli tax law.
);

-- Atomic increment — call inside payment processing transaction.
-- SELECT FOR UPDATE locks the row to prevent gaps under concurrent payments.
CREATE OR REPLACE FUNCTION next_invoice_number(p_tenant_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  seq           RECORD;
  new_number    INT;
  invoice_num   TEXT;
  this_year     TEXT;
BEGIN
  this_year := EXTRACT(YEAR FROM now())::TEXT;

  -- Lock the row for this tenant to prevent concurrent gaps
  SELECT * INTO seq
  FROM invoice_sequences
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- First ever invoice for this tenant: create the row
    INSERT INTO invoice_sequences (tenant_id, last_number, current_year)
    VALUES (p_tenant_id, 1, this_year)
    RETURNING * INTO seq;
    new_number := 1;
  ELSIF seq.current_year <> this_year THEN
    -- Year has changed: reset sequence to 1 and record the new year
    UPDATE invoice_sequences
    SET last_number = 1,
        current_year = this_year
    WHERE tenant_id = p_tenant_id
    RETURNING * INTO seq;
    new_number := 1;
  ELSE
    -- Same year: increment normally
    UPDATE invoice_sequences
    SET last_number = last_number + 1
    WHERE tenant_id = p_tenant_id
    RETURNING * INTO seq;
    new_number := seq.last_number;
  END IF;

  IF seq.year_prefix THEN
    invoice_num := seq.prefix || '-' || this_year || '-' || LPAD(new_number::TEXT, 4, '0');
  ELSE
    invoice_num := seq.prefix || '-' || LPAD(new_number::TEXT, 6, '0');
  END IF;

  RETURN invoice_num;
END;
$$;
```

#### Migration 011 — Notification log

```sql
-- All communication channels unified. One table, four channels.
CREATE TABLE notification_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),

  -- Who received it
  recipient_person_id        UUID REFERENCES people(id),
  recipient_family_member_id UUID REFERENCES family_members(id),
  recipient_email  TEXT,
  recipient_phone  TEXT,       -- E.164 format: +972501234567

  -- What was sent
  channel          TEXT        NOT NULL
                   CHECK (channel IN ('email','whatsapp','voice')),
  template_name    TEXT        NOT NULL,
  variables        JSONB,      -- template data used — for audit/resend
  subject          TEXT,       -- email subject or voice script summary
  body_preview     TEXT,       -- first 500 chars of rendered message

  -- Delivery
  external_msg_id  TEXT,       -- Resend message ID, Twilio SID
  status           TEXT        NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('sent','delivered','read','failed','bounced')),
  failure_reason   TEXT,

  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Migration 012 — Audit log

```sql
-- Immutable. RLS: insert only. No UPDATE or DELETE permitted. Ever.
CREATE TABLE audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  actor_id      UUID        REFERENCES user_profiles(id),
  actor_email   TEXT,       -- denormalised: preserved if actor later deleted
  action        TEXT        NOT NULL,
  -- Examples: 'enrolment.created', 'payment.succeeded', 'medical_data.accessed'
  entity_type   TEXT        NOT NULL,
  entity_id     UUID,
  before_state  JSONB,
  after_state   JSONB,
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Migration 013 — Tenant notification templates

> **Issue #7 fix:** WhatsApp template SIDs are now per-tenant, allowing multi-tenant support.
> Each school configures their own approved message templates with Twilio/Meta.

```sql
CREATE TABLE tenant_notification_templates (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  channel               TEXT        NOT NULL
                        CHECK (channel IN ('email','whatsapp','voice')),
  template_name         TEXT        NOT NULL,
  -- Examples: 'class_cancellation', 'payment_reminder', 'welcome', 'waiting_list_offer'

  -- For WhatsApp/Voice: Twilio Content SID (approved template ID from Meta)
  twilio_content_sid    TEXT,

  -- For Email: React Email component name or Resend template ID
  email_template_id     TEXT,

  -- For Voice: Twilio Studio flow SID or script text
  voice_script_sid      TEXT,

  -- Template version: increment when resubmitting to Meta for approval
  version               INT         NOT NULL DEFAULT 1,

  -- Approval status
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected')),
  approval_date         TIMESTAMPTZ,
  approval_notes        TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, channel, template_name)
);

CREATE INDEX idx_templates_tenant ON tenant_notification_templates(tenant_id, channel, template_name);
```

#### Migration 014 — Expense categories

> **Issue #9 fix:** Expense categories now configurable per tenant instead of hardcoded.
> Schools can add custom categories (e.g., 'guest_artist_fee', 'prop_rental').
> After creating this table, seed default categories and apply the FK to `expenses`.

```sql
CREATE TABLE expense_categories (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  name            TEXT        NOT NULL,
  description     TEXT,
  color           TEXT,       -- For UI categorization: '#FF6B6B', etc.
  is_vat_eligible BOOLEAN     NOT NULL DEFAULT true,  -- VAT reclaim eligibility
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  sort_order      INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_categories_tenant ON expense_categories(tenant_id);

-- Apply the FK from expenses.category_id to this table (promised in Migration 009)
ALTER TABLE expenses
  ADD CONSTRAINT expenses_category_fk
  FOREIGN KEY (category_id) REFERENCES expense_categories(id);

-- Make category_id NOT NULL now that the FK exists and default categories can be seeded
ALTER TABLE expenses ALTER COLUMN category_id SET NOT NULL;

-- Seed default categories for all existing tenants.
-- Run this once after Migration 014. New tenants get these via the onboarding wizard.
-- Replace YOUR_TENANT_ID with your actual tenant UUID when running manually.
-- In production, the onboarding Edge Function seeds these automatically.
INSERT INTO expense_categories (tenant_id, name, description, is_vat_eligible, sort_order)
SELECT
  t.id,
  category.name,
  category.description,
  category.is_vat_eligible,
  category.sort_order
FROM tenants t
CROSS JOIN (VALUES
  ('שכירות סטודיו',      'Studio rent',                  true,  1),
  ('שכר מורים',          'Teacher wages',                 false, 2),
  ('ציוד',               'Equipment and supplies',        true,  3),
  ('שיווק',              'Marketing and advertising',     true,  4),
  ('תוכנה ומנויים',      'Software subscriptions',        true,  5),
  ('ביטוח',              'Insurance',                     true,  6),
  ('חשמל ומים',          'Utilities',                     true,  7),
  ('שירותים מקצועיים',   'Accountant, lawyer, consultant',true,  8),
  ('אחר',                'Other',                         true,  9)
) AS category(name, description, is_vat_eligible, sort_order)
ON CONFLICT (tenant_id, name) DO NOTHING;
```

#### Migration 015 — Notification queue

> **Issue #10 fix:** Notifications now queue durably, with automatic retry on failure.
> Prevents lost messages if Twilio/Resend is temporarily unavailable.

```sql
CREATE TABLE notification_queue (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id),

  -- Recipient
  recipient_person_id        UUID REFERENCES people(id),
  recipient_family_member_id UUID REFERENCES family_members(id),
  recipient_email   TEXT,
  recipient_phone   TEXT,

  -- What to send
  channel           TEXT        NOT NULL
                    CHECK (channel IN ('email','whatsapp','voice')),
  template_name     TEXT        NOT NULL,
  template_variables JSONB,

  -- Retry logic
  attempt_count     INT         NOT NULL DEFAULT 0,
  max_attempts      INT         NOT NULL DEFAULT 3,
  next_retry_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error        TEXT,

  -- Status tracking
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','queued','sent','delivered','failed','abandoned')),
  sent_at           TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  failed_at         TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_queue_tenant_status ON notification_queue(tenant_id, status);
CREATE INDEX idx_queue_retry ON notification_queue(status, next_retry_at)
  WHERE status IN ('pending','queued');
```

#### Migration 016 — AI log

> **Issue #11 fix:** AI interactions logged separately for audit and compliance.
> Records all Claude API calls with prompts and responses (anonymised).

```sql
CREATE TABLE ai_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  user_id       UUID        REFERENCES user_profiles(id),

  -- What was requested
  feature       TEXT        NOT NULL,  -- 'chatbot', 'draft_composer', 'voice_bot'
  model         TEXT        NOT NULL,  -- 'claude-sonnet-4-6', etc.

  -- Tokens and cost
  prompt_tokens    INT,
  completion_tokens INT,

  -- System context (what data was injected into the prompt)
  system_context_summary TEXT,  -- e.g., 'school_name, class_list, faq'

  -- Input and output (store hashed for compliance, plaintext optional if flagged)
  user_message_hash    TEXT,   -- SHA256 hash for audit trail
  assistant_message_hash TEXT,

  flagged       BOOLEAN     NOT NULL DEFAULT false,  -- Manual review needed?
  flag_reason   TEXT,

  -- Compliance
  pii_detected  BOOLEAN     NOT NULL DEFAULT false,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_log_tenant ON ai_log(tenant_id, created_at);
CREATE INDEX idx_ai_log_flagged ON ai_log(tenant_id, flagged) WHERE flagged = true;
```

✅ **Cross-reference:** See [Section 10 — AI Integration Specification](#10-ai-integration-specification) for architecture details on how AI interactions are logged and audited.

---

### 4.3 RLS Reference

> **Authoritative SQL lives in `supabase/migrations/*.sql`**, not in this section.
> This section is a human-readable reference for patterns, helpers, and invariants.
> Do NOT copy SQL from here into migrations — read the migration files instead.

---

#### 4.3.1 V1 Policy Inventory

All V1 tables have RLS enabled. The table below shows who can access what.
Role checks always use `TEXT[]` array containment (e.g. `'tenant_admin' = ANY(role)`).

| Table | super_admin | tenant_admin | teacher | parent / student | anon |
|-------|-------------|--------------|---------|-----------------|------|
| `tenants` | ALL | SELECT own | SELECT own | SELECT own | RPC only |
| `user_profiles` | ALL | ALL (own tenant) | SELECT own | SELECT own | — |
| `families` | ALL | ALL (own tenant) | — | SELECT own family | — |
| `family_members` | ALL | ALL (own tenant) | — | SELECT own + family | — |
| `people` | ALL | ALL (own tenant) | SELECT (own tenant) | SELECT own family / self | — |
| `contact_preferences` | ALL | ALL (own tenant) | — | ALL own row | — |
| `terms` | ALL | ALL (own tenant) | SELECT (own tenant) | SELECT (own tenant) | — |
| `levels` | ALL | ALL (own tenant) | SELECT (own tenant) | SELECT (own tenant) | — |
| `classes` | ALL | ALL (own tenant) | ALL (own tenant) | SELECT (own tenant) | RPC only |
| `class_sessions` | ALL | ALL (own tenant) | ALL (own tenant) | SELECT (enrolled) | — |
| `class_requirements` | ALL | ALL (own tenant) | — | SELECT (own tenant) | — |
| `requirement_templates` | ALL | ALL (own tenant) | — | SELECT (own tenant) | — |
| `requirement_overrides` | ALL | ALL (own tenant) | — | SELECT own | — |
| `consent_templates` | ALL | ALL (own tenant) | — | SELECT active (own tenant) | — |
| `waiver_evidence` | ALL | ALL (own tenant) | — | SELECT own family / self | — |
| `waiver_events` | ALL | ALL (own tenant) | — | SELECT own family / self | — |
| `enrolments` | ALL | ALL (own tenant) | — | SELECT own | — |
| `waiting_list` | ALL | ALL (own tenant) | — | SELECT own | — |
| `attendance` | ALL | ALL (own tenant) | ALL (own tenant) | SELECT own | — |
| `makeup_credits` | ALL | ALL (own tenant) | — | SELECT own | — |
| `billing_accounts` | ALL | ALL (own tenant) | — | SELECT (via enrolment) | — |
| `payments` | ALL | ALL (own tenant) | — | SELECT own | — |
| `invoice_sequences` | ALL | SELECT (own tenant) | — | — | — |
| `notification_log` | ALL | SELECT + INSERT | — | — | — |
| `audit_log` | ALL | SELECT + INSERT | — | — | — |
| `tenant_notification_templates` | ALL | ALL (own tenant) | — | SELECT approved | — |
| `tenant_email_customizations` | ALL | ALL (own tenant) | — | SELECT own tenant | — |
| `expense_categories` | ALL | ALL (own tenant) | — | SELECT active (own tenant) | — |
| `verification_attempts` | SELECT | ALL (own tenant) | — | — | service_role only |
| `otp_codes` | — | — | — | — | service_role only |

---

#### 4.3.2 Helper Functions

Tenant-scope helpers are defined in [`supabase/migrations/20260608000200_core_tenants.sql`](supabase/migrations/20260608000200_core_tenants.sql).
All are `SECURITY DEFINER SET search_path = public STABLE`.

| Function | Returns | Purpose |
|----------|---------|---------|
| `get_my_tenant_id()` | `UUID` | Resolves caller's `tenant_id` from `user_profiles` |
| `is_super_admin()` | `BOOLEAN` | `'super_admin' = ANY(role)` — platform bypass |
| `is_service_role()` | `BOOLEAN` | JWT role = `service_role` — for Edge Function paths |
| `get_my_account_ids()` | `SETOF UUID` | All `account_id` values for caller via `account_members` |
| `get_my_person_id()` | `UUID` | The `people.id` for the calling user |
| `is_minor(date_of_birth DATE)` | `BOOLEAN` | Computed from DOB; not stored as a column |

Defined in [`supabase/migrations/20260608000300_people.sql`](supabase/migrations/20260608000300_people.sql): `get_my_account_ids()`, `get_my_person_id()`, `is_minor()`.

Additional RPCs in [`supabase/migrations/20260608002000_admin_rpcs.sql`](supabase/migrations/20260608002000_admin_rpcs.sql): `get_my_profile()`, `link_auth_user_to_person()`.

---

#### 4.3.3 SECURITY DEFINER Requirements

Every `SECURITY DEFINER` function MUST:

1. Include `SET search_path = public` in the function definition (prevents search-path injection).
2. Have an explicit `GRANT EXECUTE TO <role>` — do not rely on default public grants.
3. Guard privileged operations with a role check (`is_service_role()`, `is_super_admin()`, or explicit `EXISTS` on `user_profiles`).

```sql
-- Correct pattern:
CREATE OR REPLACE FUNCTION my_function(p_arg TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- body
END;
$$;
GRANT EXECUTE ON FUNCTION my_function(TEXT) TO authenticated;
```

Public RPCs (accessible to `anon`) additionally MUST filter by `p_subdomain` and MUST NOT return data from any other tenant.

---

#### 4.3.4 Operational Dependencies

- Scheduled jobs are now managed by migration `20260608002600_scheduled_jobs.sql` (pg_cron + pg_net, UTC schedules for Jerusalem business intent).
- Required deploy-time DB settings (no hardcoded secrets in SQL): `app.settings.supabase_functions_url`, `app.settings.cron_secret`.
- Production prerequisite: `CRON_SECRET` must be set both in Edge Function secrets and DB GUC before enabling cron jobs.

| Dependency | Where configured | Notes |
|------------|-----------------|-------|
| `app.encryption_key` | Supabase project secrets (manual runbook) | Required for `pgp_sym_encrypt/decrypt`; set before running Stripe credential RPCs |
| pg_cron — OTP cleanup | Comment in `20260608000700_audit_security.sql` | Run `SELECT cron.schedule(...)` after first deploy |
| pg_cron — verification cleanup | Comment in `20260608000700_audit_security.sql` | Run `SELECT cron.schedule(...)` after first deploy |
| Stripe/Twilio/Resend keys | Admin UI or runbook after schema deploy | See [Third-Party Services Setup](docs/deployment/THIRD_PARTY_SERVICES.md) |
| `waiver-pdfs` storage bucket | Supabase Dashboard → Storage | Private bucket; see self-hosted waiver runbook in [Third-Party Services Setup](docs/deployment/THIRD_PARTY_SERVICES.md) |

---

#### 4.3.5 Deferred / V2+ Tables

The following tables and features are designed but NOT in V1 migrations. Do not implement until a V2 migration is explicitly planned:

- `expenses` (full expense tracking)
- `discount_rules`
- `teacher_pay_records`
- `notification_queue` (retry/queue mechanism)
- `ai_log`
- `tenants.custom_domain`, `tenants.logo_url`, `tenants.plan`, Resend/Twilio columns on `tenants`

---

### 4.4 SPEC Issues Resolution (v3 updates — 2026-05-20)

**2026-06-08 — Migrations consolidated to 25-file chain (`20260608000200`–`20260608002500`):**
- Supersedes the 34-file `20260526*`–`20260610*` history; superseded files retained read-only under `supabase/migrations_backup/legacy_20260608/`. Authoritative index is §4.2.0.
- Every `ALTER TABLE` baked into its base `CREATE TABLE` (no stacked alters): `tenants.from_email`; `offerings.waiver_required` + `cover_image_path`; `engagements` age-override + waiver-deadline + `waiver_evidence_id` FK; `waiver_evidence.offering_id` + `guardian_confirmed`.
- `waiver_evidence`/`waiver_events` reordered before `engagements` so `waiver_evidence_id` is a real FK. `sign_waiver()` is the single 26-param signature (`SET search_path = public`).
- `pending_waiver` status threaded through `link_auth_user_to_person()`, `search_enrolment_students()`, `cancel_engagement()`, `link_auth_user_to_guardian_for_engagement()`.
- `consent_template_immutable` trigger fixed to lock content/name/hash only (status transitions allowed). Storage buckets split into `20260608001700_storage.sql`. `provision_tenant()` gained `p_from_email`.
- `waiver_evidence`/`waiver_events` added to the `authenticated` SELECT grant. Dev reset: `supabase/reset_dev_db.sql` then `pnpm db:push`; `supabase/seed.sql`; `pnpm db:types`.

**2026-05-26 — Migrations consolidated to 18-file chain (`20260526000100`–`20260526001800`):**
- Supersedes the earlier `20260519*` / `20260525*` filename sprawl; authoritative index is §4.2.0
- Auth trigger fix (`raw_user_meta_data`, tenant fallback, `ON CONFLICT`) merged into `016`
- `link_auth_user_to_person()` merged into `017`; table grants consolidated in `018`
- Dev reset: `supabase/reset_dev_db.sql` then `pnpm db:push`

**2026-05-20 — SPEC §4 + migrations RLS/subdomain model unified:**
- §4 security banner rewritten to layered model with documented exceptions (§4.1.1 added)
- §4.3 old duplicate SQL block replaced with policy inventory + helper reference + deferred appendix
- Migrations 015 (`public_rpcs`) replaced unfiltered views with subdomain-filtered `SECURITY DEFINER` RPCs
- Cross-tenant `USING (true)` policies removed from all V1 migrations; replaced with `tenant_id = get_my_tenant_id()`
- `otp_codes` RLS hardened (service_role only, RLS enabled before policies, `REVOKE ALL` from anon/authenticated)
- `SECURITY DEFINER SET search_path = public` applied to all helper functions and trigger
- `contact_preferences` extended with `notify_waiting_list` and `notify_school_announcements`
- `is_super_admin()` bypass policies added to all V1 tables; `is_service_role()` in migration 001; table grants consolidated in migration 018
- `EXECUTE PROCEDURE` → `EXECUTE FUNCTION` in trigger (Postgres 14+ convention)
- **Verification pending:** `pnpm db:reset-local` requires Docker Desktop running. Run `pnpm db:reset-local` then `pnpm db:types` before first remote deploy and confirm smoke-test matrix (§4.3, Phase 2 exit criteria).

**Out of scope — follow-up tasks before production:**
- `apps/web/src/features/notifications/hooks/useContactPreferences.ts` queries `user_profile_id` on `contact_preferences` — DB uses `person_id` / `family_member_id`. Requires app-layer fix.
- Regenerate `packages/shared/src/database.types.ts` and Zod schemas after `pnpm db:types`
- pg_cron schedules for OTP and verification cleanup (see comments in migration 006)

All 15 identified issues from v2 remain resolved:

### Critical issues (5) — Fixed in schema

| #   | Issue                                                | Fix location                                                                                             |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | user_profiles FK ordering                            | Migration 001: `tenants` created first, then `user_profiles` references `tenants(id)`                    |
| 2   | Invoice sequence year-boundary bug                   | Migration 010: Fixed next_invoice_number() with explicit year variable & initialization                  |
| 3   | No RLS bypass for super_admin                        | Section 4 helper functions: Added is_super_admin(), all policies now include super_admin bypass          |
| 4a  | family_members missing tenant_id                     | Migration 002: Added tenant_id column to family_members with NOT NULL constraint                         |
| 4b  | 10+ tables missing RLS policies                      | Section 4: Comprehensive RLS policies written for all 20 tables, every table now has super_admin bypass  |
| 5   | payments nullable on both family_id and person_id    | Migration 008: Added CONSTRAINT payment_payer CHECK ((family_id IS NOT NULL) OR (person_id IS NOT NULL)) |

### Significant issues (5) — Fixed with new tables & logic changes

| #   | Issue                                                 | Fix location                                                                                                    |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 6   | Unique constraint blocks re-enrolment                 | Migration 006: Changed enrolments UNIQUE constraint to WHERE status NOT IN ('cancelled','withdrawn')            |
| 7   | WhatsApp template SIDs hardcoded; breaks multi-tenant | Migration 013: New tenant_notification_templates table; Phase 1D updated to query templates per tenant          |
| 8   | Subscription vs. payment intent ambiguity             | Section 6 Phase 1E: Payment state machine now explicit (see Phase 1E detailed architecture)                      |
| 9   | Expense categories hardcoded in CHECK                 | Migration 014: New expense_categories table; expenses now reference this table instead of hardcoded CHECK       |
| 10  | No notification retry/queue mechanism                 | Migration 015: New notification_queue table with retry logic, attempt tracking, and exponential backoff pattern |

### Worth knowing issues (5) — Fixed with schema/documentation

| #   | Issue                                            | Fix location                                                                                                         |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 11  | ai_log table referenced but never defined        | Migration 016: Defined ai_log table with full audit trail for AI interactions (tokens, flags, PII detection)         |
| 12  | VAT rounding strategy undefined                  | Section 2.5: Documented banker's rounding strategy (ISO 80000-1, Israeli accounting norms)                           |
| 13  | is_minor stored boolean never revalidated        | V1: `is_minor` computed in app/Zod from `date_of_birth`; SQL helper `is_minor(date)` in migration 002               |
| 14  | decryptVault() doesn't match Supabase Vault API  | Section 5: Updated getTenantConfig() to use SQL function with pgp_sym_decrypt() via RPC, not raw decryptVault()      |
| 15  | waiting_list.position requires manual management | Migration 007: Removed position column; use ROW_NUMBER() OVER (PARTITION BY class_id ORDER BY added_at) for position |

### 4.5 Financial Integrity Rules

🔒 **SECURITY & LEGAL — Immutable Financial Records:**
All payments and expenses are immutable by design. Corrections are new entries with negative values linked to the original.
This pattern ensures: audit trail, tax compliance, dispute resolution, and prevents data manipulation.

- **No-Update Policy:** Records in the `payments` and `expenses` tables are immutable. Any change (e.g., a refund or a correction) must be recorded as a _new_ row with a negative value, linked to the original `transaction_id`.
- **System-Generated Invoices:** Invoices must be generated as signed, read-only PDFs at the moment of payment and stored in a versioned bucket.
- **Sequence Locking:** The `invoice_sequence` table must use a database-level lock (`SELECT FOR UPDATE`) during incrementing to prevent "skipping" or "doubling" numbers during high-concurrency registration events.

---

## 5. Auth & Authorisation

### Role model

| Role           | Auth method            | Access                                             |
| -------------- | ---------------------- | -------------------------------------------------- |
| `super_admin`  | Password + 2FA         | All tenants — platform owner only                  |
| `tenant_admin` | Password               | Full school data                                   |
| `teacher`      | Password or magic link | Own classes: read + attendance + placement confirm |
| `parent`       | Magic link or email OTP (V1); SMS OTP (Phase 1D+) | Own family: read + pay + update contact            |
| `student`      | Magic link or email OTP (V1); SMS OTP (Phase 1D+) | Own data only: adult students with portal access   |

### Login methods

| Method | Roles | Flow | Cross-device |
| ------ | ----- | ---- | ------------ |
| **Password** | `super_admin`, `tenant_admin`, `teacher` | `signInWithPassword` → `/dashboard` | Yes |
| **Magic link (PKCE)** | `parent`, `student`, `teacher` | `signInWithOtp` + `emailRedirectTo` → `/auth/callback` | No — same browser/profile |
| **Email OTP (V1)** | `parent`, `student` | `signInWithOtp` + `verifyOtp({ type: 'email' })` → `/dashboard` | Yes — enter 6-digit code from email |
| **SMS OTP login (deferred)** | `parent`, `student` | After Phase 1D phone stack | Yes — WebOTP autofill |
| **WhatsApp OTP login (deferred)** | `parent`, `student` | After WhatsApp templates approved | Yes |

**Email OTP prerequisites:** Supabase Auth Magic Link email template must include `{{ .Token }}` (see `docs/deployment/AUTH_EMAIL_SETUP.md`).

**SMS/WhatsApp OTP login prerequisites (deferred — do not implement in V1):**

- Twilio Verify production setup (`send-otp-sms` Edge Function)
- Phone number linked to account (`contact_preferences` / `family_members`)
- Edge Function to verify code **and issue Supabase session** (signup references missing `verify-otp` today)
- WebOTP SMS body format for autofill (`@domain #code`)
- Rate limiting via `verification_attempts` (migration 006)

### Adult student portal access

Adult students (`is_minor = false`, `user_profile_id IS NOT NULL`) get their own magic link login. They access the `student` role portal — identical to parent portal but showing their own data, not a child's data. No family relationship required.

### Tenant key injection pattern

Edge Functions must load the correct tenant's API keys for every request. Keys are encrypted using PostgreSQL's `pgp_sym_encrypt()` and decrypted server-side only.

```typescript
// supabase/functions/_shared/tenant-config.ts
// FIXED: uses correct Supabase Vault API (pgp_sym_decrypt) via SQL, not raw function calls
export async function getTenantConfig(
  tenantId: string,
  supabase: SupabaseClient,
) {
  // Query tenant data WITH decryption via SQL function (runs on server only)
  const { data: tenant, error } = await supabase.rpc(
    "get_decrypted_tenant_config",
    { p_tenant_id: tenantId },
  );

  if (error || !tenant) throw new Error(`Tenant not found: ${error?.message}`);

  return {
    stripeSecretKey: tenant.stripe_secret_key,
    stripeWebhookSecret: tenant.stripe_webhook_secret,
    resendApiKey: tenant.resend_api_key,
    resendFromEmail: tenant.resend_from_email,
    twilioAccountSid: tenant.twilio_account_sid,
    twilioAuthToken: tenant.twilio_auth_token,
    twilioWhatsAppNumber: tenant.twilio_whatsapp_number,
    vatRate: tenant.vat_rate,
    currency: tenant.currency,
    locale: getLocale(tenant.language_default, tenant.country),
  };
}

// V1 implemented: get_tenant_stripe_credentials(p_tenant_id) — service_role only
// Returns decrypted stripe_secret_key, stripe_webhook_secret (BYTEA columns on tenants).
// Admin UI writes via save_tenant_stripe_credentials() — tenant_admin + app.encryption_key.
// Resend/Twilio per-tenant decryption deferred (platform env in send-notification for now).
```

**Key security details:**

- Encrypted secrets never leave the database unencrypted
- Decryption happens via `SECURITY DEFINER` SQL function (runs as function owner, not caller)
- Encryption key stored in database settings (`app.encryption_key`), not in code
- Edge Functions access only the decrypted result, never the encrypted column values

### 5.3 Regional Data Sovereignty

> **V1 scope:** Single Supabase project, Israeli region. No multi-region routing in V1.

For V1 serving Israeli schools only: choose the EU (Frankfurt) Supabase region at project creation. This satisfies Israeli data residency requirements under the Privacy Protection Law — EU is considered adequate. Document your data residency decision in writing before launch (required by the Privacy Protection Authority).

**V3 consideration (when expanding to UK or other regions):**
Multi-region support — dynamic connection routing based on `tenant.region`, region-pinned storage buckets, cross-region write guards — requires a dedicated architecture design before implementation. Do not attempt to build this in V1 or V2. When the requirement arises, treat it as a separate design phase with its own spec. The `tenants` table will need a `region TEXT` column at that point.

---

## 6. V1 Implementation

> **V1 scope:** Fully working single-school system. Multi-tenant infrastructure in place.
> Parent portal and adult student portal included. Expense tracking included.
> WhatsApp notifications for critical events included.
> **Estimated effort:** 310–380 hours with AI tooling.

### Phase 1A — Project skeleton (Days 1–3)

```bash
pnpm dlx create-turbo@latest ballet-school-system --package-manager pnpm
cd ballet-school-system
pnpm create vite@latest apps/web -- --template react-ts
cd apps/web

pnpm add \
  @supabase/supabase-js @tanstack/react-query @tanstack/react-query-devtools \
  react-router-dom react-hook-form @hookform/resolvers zod \
  date-fns lucide-react clsx tailwind-merge recharts \
  @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid \
  @fullcalendar/interaction @fullcalendar/core \
  @stripe/stripe-js @stripe/react-stripe-js \
  i18next react-i18next

pnpm add -D tailwindcss postcss autoprefixer tailwindcss-rtl \
  @types/node vitest @testing-library/react @testing-library/user-event \
  @vitejs/plugin-react

pnpm dlx tailwindcss init -p
pnpm dlx shadcn@latest init   # New York style, Zinc, CSS variables: yes
```

**Day 1 checklist before any feature work:**

- [ ] `index.html` uses safe default `lang="en" dir="ltr"`; `DocumentLanguageSync` sets resolved `lang`/`dir` after load
- [ ] `tailwindcss-rtl` plugin added to `tailwind.config.ts`
- [ ] `format.ts` utilities created (currency, date, phone)
- [ ] i18next configured with `he.json` as primary, `en.json` as secondary
- [ ] FullCalendar Hebrew locale imported *(deps present; admin calendar UI deferred — not V1-shipped)*
- [ ] All Tailwind spacing uses `ms-`, `me-` not `ml-`, `mr-`
- [ ] **WCAG 2.1 AA:** Install `@axe-core/react`, `axe-playwright`, `eslint-plugin-jsx-a11y` (run `pnpm dlx snyk test` first)
- [ ] **WCAG 2.1 AA:** Configure ESLint with jsx-a11y plugin and rules in `.eslintrc.json`
- [ ] **WCAG 2.1 AA:** Create `e2e/accessibility-compliance.spec.ts` with heading structure, form validation, focus trap tests
- [ ] **WCAG 2.1 AA:** Add pnpm scripts to `package.json`: `a11y:lint`, `a11y:axe`, `a11y:e2e`
- [ ] **WCAG 2.1 AA:** Add axe-core CI job to `.github/workflows/ci.yml` **(blocks merge if violations found — non-negotiable)**
- [ ] **WCAG 2.1 AA:** Configure CI: `axe-core` returns exit code 1 on ANY violation; merge is prevented until resolved
- [ ] **WCAG 2.1 AA:** Add accessibility checklist to `.github/PULL_REQUEST_TEMPLATE.md`
- [ ] **WCAG 2.1 AA:** Create manual test plan for NVDA Hebrew smoke test (15 min pre-deployment)
- [ ] Confirm `pnpm-lock.yaml` is the only lockfile — delete `package-lock.json` if present
- [ ] **i18n compliance:** All UI text in `he.json` and `en.json`. Verify no hard-coded strings in components:
  ```bash
  grep -r "className.*text.*[א-ת]" apps/web/src/pages apps/web/src/components
  # Should return zero matches (Hebrew text only in .json files)
  ```
- [ ] **RTL mirror test:** Temporarily change `index.html` `lang="en" dir="ltr"` and verify layout flips correctly. All spacing must use `ms-`, `me-`, `ps-`, `pe-`.

**Definition of Done — Phase 1A (must pass all before Phase 1B starts):**

UI & Translations:

- [ ] All user-facing text in `he.json` and `en.json`
- [ ] No hard-coded strings in page components (search for Hebrew/English text in TSX files)
- [ ] Components use `useTranslation()` hook: `const { t } = useTranslation()`
- [ ] Translation keys follow pattern: `pages.login`, `pages.signup`, `pages.admin_dashboard`, `pages.portal_dashboard`, `error.not_found`
- [ ] English and Hebrew keys match exactly (same structure, different content)
- [ ] RTL mirror test passed: flip to English + `dir="ltr"`; verify layout
- [ ] Linting passes: `pnpm run lint` (zero errors)
- [ ] Build succeeds: `pnpm run build` (zero errors)
- [ ] No TypeScript errors: `tsc --noEmit`

### Phase 1A Addendum — Schema-First Workflow & Build Gates

These gates prevent schema mismatches from cascading through features. **Mandatory before proceeding to Phase 1B.**

**Before implementing ANY data component (form, hook, list):**

- [ ] Locate the relevant migration in SPEC.md Section 4.2 defining that table (e.g., Migration 002 for `people`)
- [ ] Read the full table definition, noting all column names and types
- [ ] Import the Zod schema from `@shared/schemas` (not a local type copy)
- [ ] Verify imported schema fields match SPEC.md migration exactly (use `grep` or manual check)
- [ ] Build first component + run `pnpm run build` immediately
- [ ] Fix all TypeScript errors before moving to component #2 (no skipping)
- [ ] Repeat for each feature component: build + validate before next

**Example — PersonForm implementation workflow:**

```bash
# Day 1: Schema reading + first component
1. Read SPEC.md Migration 002 (people table, lines ~600-628)
2. Note fields: id, full_name (TEXT), date_of_birth (DATE?), is_minor (COMPUTED), status (TEXT), ...
   -- NOTE: no email column on people; email lives in contact_preferences
3. Import schema: import { PersonSchema } from '@shared/schemas'
4. Implement PersonForm.tsx using PersonSchema
5. Run `pnpm run build`
   → If errors: schema mismatch caught HERE (first component)
   → Fix field names (e.g., name, not first_name + last_name)
   → Run build again until zero errors
6. Only then: proceed to PeopleList.tsx

# Why immediate build:
# PersonForm alone: 25 min implementation + 5 min build = 30 min
# PersonForm + PeopleList + PeoplePage (no intermediate builds):
#   45 min implementation + 2 hours debugging 80+ cascading errors = 2h 45m
# The earlier you validate, the faster you move
```

**Checklist for each feature module (People, Families, Classes, Enrolments):**

- [ ] Schema reading complete (5 min)
- [ ] Zod import verified against `@shared/schemas` (2 min)
- [ ] First component implemented (form, hook, list) (10-15 min)
- [ ] `pnpm run build` passes zero errors (5 min)
- [ ] All dependent components built after schema validation (PeopleList only after PersonForm builds)
- [ ] Final: `pnpm run lint` zero errors, `pnpm run build` zero errors

**Red flags (stop and re-read SPEC.md schema):**
- Form field names don't match migration column names
- TypeScript error: "Property 'X' does not exist on type 'Person'"
- Build fails immediately after first component creation
- You assumed a field name instead of checking the schema

**Cost of ignoring this gate:**
- Stream 1 Reality: 90% feature completion, 80+ build errors, 2 hours debugging
- Root cause: Schema mismatch discovered late (after component 5)
- Prevention cost: 5 min schema reading + 5 min immediate build per component = ~30 min total per feature
- Prevention value: Zero cascading errors, feature builds cleanly, confidence in type safety

### Phase 1B — Auth and tenant context (Days 4–6)

Key implementation: `useTenant()` resolves from subdomain. In dev: `VITE_DEV_TENANT_SUBDOMAIN`. In prod: `window.location.hostname.split('.')[0]`.

Route guards: `AdminRoute`, `TeacherRoute`, `ParentRoute`, `StudentRoute` (adult portal).

Login page tabs: **Password**, **Magic Link**, **Email Code**. The Code tab uses Supabase native email OTP (`signInWithOtp` + `verifyOtp({ type: 'email' })`) — no `/auth/callback` route.

### Phase 1C — Core data modules (Days 7–20)

Build in this strict order (each module depends on previous):

| Order | Module                 | Key screens                                                   | Dependencies |
| ----- | ---------------------- | ------------------------------------------------------------- | ------------ |
| 1     | People                 | List (search/filter/status), detail with medical, create/edit | Migrations 002-003 |
| 2     | Families               | Detail with members, link adult student accounts              | People module |
| 3     | Levels + Terms         | Admin setup: create levels, create/mark current term          | Migrations 004 |

> ⚠️ **Agent note — terms query pattern:** The `terms` table uses `status TEXT` (not `is_current BOOLEAN`).
> Always query the active term as:
> ```typescript
> supabase.from('terms').select('*').eq('tenant_id', tenantId).eq('status', 'active').single()
> ```
> Never use `.eq('is_current', true)` — that column does not exist.
| 4     | Classes + Requirements | Create class, define requirements, optional `staff_id` on offering (no teachers admin UI in V1) | Levels, Terms, Migrations 005 |
| 5     | Class sessions         | Generate sessions via Edge Function on class creation         | Classes module |
| 6     | Enrolment              | 4-step wizard (no placement questionnaire in V1)              | People, Families, Classes, Sessions (Migrations 006) |

> **Teachers admin (deferred V2.11):** V1 includes the `staff` table, `staff_id` on `offerings`, `TeacherService` / `useTeachers`, and optional teacher select on the class form — but **no** `/admin/setup/teachers` CRUD page, teacher login portal, or payroll. Add staff rows via seed/dev SQL until V2.11 ships. Plan: [docs/plans/teachers-admin-module.md](docs/plans/teachers-admin-module.md).

#### V1 enrolment wizard (simplified — no placement scoring)

> **2026-06 update:** Step 1 uses context-aware student selection (parent child list / admin search), not email lookup. One parent login maps to one account.

```
Step 1: Identify the person
  → Returning family: search by email → select existing person
  → New: collect parent/guardian details + person details
  → Adult student: collect their own details, create user_profile

Step 2: Class selection
  → Show classes available in current term
  → Filter by class requirements (age, prerequisites, etc.)
  → Show waiting list option if full
  → Optional text field: "Any prior experience?" (stored as prior_experience)

Step 3: Checkout
  → Optional discount code
  → Stripe Payment Element
  → VAT breakdown shown clearly
  → Summary: class, price, VAT, total

Step 4: Confirmation
  → Success state with class details
  → Trigger: confirmation email + WhatsApp if opted in
  → Link to portal
```

#### Waiver lifecycle and enrolment gate (V1)

Waiver acceptance is required for legal participation eligibility. **V1 uses self-hosted in-app acceptance** (§2.7.1) — not a third-party e-sign provider.

**Core rule: every enrolment requires a fresh signature.** There is no cross-enrolment reuse. `waiver_evidence.offering_id` records the class the signature was for; `engagements.waiver_evidence_id` records which evidence row covers that enrolment.

**Who signs:**
- Minor student (under 18): a parent or legal guardian must sign. The system enforces this at both server (`accept-waiver` returns 403 if `signed_by_role === 'self'` and student is a minor) and client (hard-block UI with a message directing the user to ask a parent/guardian to log in).
- Guardian signs on behalf of minor: must check the explicit guardian-declaration checkbox (`guardian_confirmed = true`). `accept-waiver` returns 400 if `guardian_confirmed !== true` for a minor student.
- Adult student: self-signs (`signed_by_role = 'self'`); no guardian checkbox shown.

**Authentication paths supported by `accept-waiver`:**
- **Authenticated (Supabase JWT):** standard flow for logged-in parents and adult students.
- **WaiverToken (guest magic link):** `Authorization: WaiverToken <signed-jwt>` for guests signing after payment via emailed link. Token carries `{ eid: engagement_id, tid: tenant_id, em: email, exp: unix_ts }`. `accept-waiver` verifies the token, then cross-checks that `body.person_id` matches the engagement's `person_id`.

**Engagement statuses relevant to waivers:**
- `pending_waiver` — payment complete (or not required), but waiver not yet signed. Used for guests who pay before signing.
- `active` — waiver signed (or not required by the offering). `accept-waiver` bulk-upgrades all `pending_waiver` engagements for the person in the tenant on successful signing.

**Guest waiver flow (post-payment signing):**
1. During enrolment, unauthenticated guests see `GuestVerifyStep` — a disclosure screen listing consequences of not signing (classes not attended, no refund, auto-cancel at 7 days). Guest must check an acknowledgment checkbox before proceeding to payment.
2. After payment, Stripe webhook creates the engagement with `status = 'pending_waiver'` and sets `waiver_deadline = now() + 7 days`.
3. The webhook (or `create-enrolment-intake` Edge Function) sends an `EnrolmentConfirmationEmail` containing a magic link to `{APP_URL}/enrol/complete?engagementId=...&wt=<WaiverToken>`.
4. Guest clicks the link → `EnrolCompletePage` loads → `get-waiver-engagement` RPC fetches the engagement → `WaiverStep` rendered using `WaiverToken` auth.
5. On successful signing, the engagement transitions to `active`.

**Reminder and auto-cancel cron (`send-waiver-reminder` Edge Function):**

Scheduled every 6 hours via pg_cron. Protected by `CRON_SECRET` env var. Processes up to 100 `pending_waiver` engagements per run.

| When | Action |
|---|---|
| deadline − 5 days (first notice) | Send `WaiverReminderEmail` with fresh magic-link WaiverToken |
| deadline − 48 hours (final notice) | Send urgent `WaiverReminderEmail` with fresh magic-link WaiverToken |
| Past deadline | Cancel engagement (`status = 'cancelled'`), issue Stripe full refund if paid, send `WaiverCancelledEmail`, append `revoked` event to `waiver_events` |

Reminder timestamps (`waiver_48h_reminded_at`, `waiver_5d_reminded_at`) on the `engagements` table prevent duplicate sends.

**App flow (authenticated user):**

**Step 1 — Load & render (`waiver-viewed` Edge Function)**
1. Load active `consent_templates` row for tenant.
2. Render full waiver text in `WaiverStep` component; submit button is disabled.
3. `IntersectionObserver` fires once when the scroll sentinel at the bottom of the text enters the viewport (threshold 1.0).
4. Client calls `POST /functions/v1/waiver-viewed` with `{ person_id, consent_template_id }`.
5. Edge Function inserts a `viewed` event into `waiver_events` (with `waiver_evidence_id = NULL`) and returns `{ view_token, viewed_at_ts, expires_at }`.
6. Client stores `{ view_token, viewed_at_ts }` in component `useRef` (never localStorage). Submit activates.

**Step 2 — Affirm**
7. Signer checks the "I have read and accept" checkbox and types their full legal name.
8. If student is a minor: signer must also check the guardian-declaration checkbox ("I confirm I am the parent or legal guardian of [student name]..."). `guardian_confirmed` set to `true`.
9. If `tenants.waiver_require_otp = true` (V2): Twilio Verify OTP step here (infrastructure exists — see §2.7.1 Deferred).

**Step 3 — Submit (`accept-waiver` Edge Function)**
10. Client calls `POST /functions/v1/accept-waiver` with body:
    ```json
    {
      "person_id": "<uuid>",
      "offering_id": "<uuid>",
      "consent_template_id": "<uuid>",
      "consent_version": <int>,
      "typed_name": "<string>",
      "idempotency_key": "<uuid>",
      "view_token": "<base64url>",
      "viewed_at_ts": <unix_seconds>,
      "guardian_confirmed": <boolean>,
      "account_member_id": "<uuid|null>"
    }
    ```
11. Edge Function validates:
    - Auth (JWT or WaiverToken) — rejects if neither present/valid.
    - `view_token` — recomputes HMAC over `person_id:template_id:viewed_at_ts`, constant-time compare, rejects if expired (>900 s) or tampered.
    - Template `status === 'active'` and `version` matches `consent_version` — rejects 409 on mismatch.
    - Student `date_of_birth` looked up: if minor and `guardian_confirmed !== true` → 400. If minor and `signed_by_role === 'self'` → 403.
    - For WaiverToken path: `person_id` in body must match the engagement's `person_id`.
12. Captures server-side: timestamp, IP (`x-forwarded-for` first segment), user agent, `Accept-Language`.
13. Computes `consent_version_hash` = SHA-256 of `wording_snapshot`.
14. Computes `record_hmac` over 15-field canonical JSON (alphabetical; see §4.2.9).
15. Calls `supabase.rpc('sign_waiver', payload)` — single atomic DB write.
16. Bulk-upgrades `pending_waiver` engagements for the person in the tenant to `active`.
17. Returns `{ evidence_id, signed_at }` to client.

**EnrolmentStepper gate (authenticated flow):**
- `showWaiverStep` is computed synchronously from `offering.waiver_required` (returned by `get_public_offerings_by_subdomain` RPC) — no async delay that could be bypassed.
- Before advancing to checkout, the stepper checks `showWaiverStep && !waiverSignedInFlow`; if true, it redirects back to the waiver step.
- After signing, `waiverSignedInFlow = true` and `waiverEvidenceId` is stored; the evidence ID is passed to `createEnrolment` as `waiver_evidence_id`.
- If the user clicks Back from checkout to the waiver step, a read-only view is shown (cannot re-sign in the same flow session).

**Evidence required per signed waiver:**
- `consent_template_id`, `consent_version`, `consent_version_hash`, `wording_snapshot`
- `pdf_storage_path` (V1: `'v1-deferred'` sentinel), `pdf_sha256` (V1: `'000...0'`)
- `offering_id` (class the waiver was signed for), `guardian_confirmed`
- Signer identity (`signed_by_name`, `signed_by_email`, `signed_by_role`)
- `signature_method`, `signed_at` (UTC), `ip_address`, `user_agent`, `accept_language`
- Append-only `waiver_events` chain (viewed → accepted)
- `audit_log` entry with `person_id`, `consent_template_id`, `offering_id`

**Blocking rules:**
- For authenticated users: enrolment checkout is blocked if `showWaiverStep && !waiverSignedInFlow`.
- For guests: engagement is created with `status = 'pending_waiver'`; transitions to `active` only after `accept-waiver` runs.
- Auto-cancel after 7-day deadline if waiver unsigned (with Stripe refund if paid).
- Admin override (`admin_attestation` / `admin_upload`) is V2 (at-door plan, not yet built).

**Deferred (V2+):**
- At-door / kiosk waiver signing: QR code generation, kiosk page, admin attestation for paper waivers. Full plan exists and is ready for implementation.
- On-demand PDF export from admin panel.
- OTP enforcement for waiver signing (column + Twilio plumbing exist; UI and `verify-waiver-otp` Edge Function are V2).

### Phase 1D — Notifications (Days 21–26)

> **Cross-reference — SMS/WhatsApp OTP login (deferred):** Parent/student **login** via SMS or WhatsApp builds on the enrolment notification OTP infrastructure (`send-otp-sms`, Twilio Verify). Login requires an Edge Function that verifies the code **and issues a Supabase session**, not verification alone. See §5 Login methods.

#### send-notification Edge Function — routes by channel

```typescript
// supabase/functions/send-notification/index.ts
// Single function handles email, WhatsApp, and (in V2) voice

serve(async (req) => {
  const { tenantId, recipientId, recipientType, template, variables } =
    await req.json();
  const config = await getTenantConfig(tenantId, supabase);

  // Load recipient's contact preferences
  const prefs = await getContactPreferences(
    recipientId,
    recipientType,
    supabase,
  );

  const results = [];

  // Email: always sent if opted in (default true)
  if (prefs.email_opted_in && prefs.email) {
    results.push(await sendEmail(config, prefs, template, variables));
  }

  // WhatsApp: sent if opted in and number verified
  if (
    prefs.whatsapp_opted_in &&
    prefs.whatsapp_verified &&
    prefs.whatsapp_number
  ) {
    results.push(await sendWhatsApp(config, prefs, template, variables));
  }

  // Log all attempts
  for (const result of results) {
    await supabase.from("notification_log").insert({
      tenant_id: tenantId,
      ...result,
    });
  }

  return new Response(JSON.stringify({ sent: results.length }));
});
```

#### WhatsApp setup requirements (start this process before coding begins)

1. Create Twilio account
2. Apply for WhatsApp Business API via Twilio Console
3. Submit message templates for approval (Meta approves these — takes 1–5 days):
   - `class_cancellation`: "{{school_name}}: Your {{student_name}}'s class on {{date}} has been cancelled. {{reason}} A make-up credit has been added to your account."
   - `waiting_list_offer`: "{{school_name}}: A spot has opened in {{class_name}}. Complete enrolment by {{expiry}} to secure it: {{link}}"
   - `payment_reminder`: "{{school_name}}: A payment of {{amount}} for {{student_name}} is pending. Update payment: {{link}}"
   - `welcome`: "Welcome to {{school_name}}! Access your parent portal: {{link}}"
4. Only send approved templates to new contacts — free-form messages require prior contact
5. **WhatsApp Phone Number Verification Flow:**
   - Parent enters phone number in enrolment form
   - Click "Verify with WhatsApp OTP"
   - Twilio Verify API sends 6-digit code to phone via WhatsApp
   - Parent enters code in form
   - Frontend validates code against Twilio Verify API
   - On success: `contact_preferences.whatsapp_verified = true` + phone number stored
   - Future notifications use verified number (no re-verification needed)
   - Fallback: If parent skips verification, WhatsApp is unchecked in preferences (can enable later)

#### WhatsApp integration (Issue #7 fix: per-tenant template SIDs)

```typescript
// supabase/functions/_shared/whatsapp.ts
import twilio from "https://esm.sh/twilio";

export async function sendWhatsApp(
  config: TenantConfig,
  tenantId: string,
  prefs: ContactPreferences,
  template: string,
  variables: Record<string, string>,
  supabase: SupabaseClient,
): Promise<NotificationResult> {
  const client = twilio(config.twilioAccountSid, config.twilioAuthToken);

  // FIXED (Issue #7): Load template SID from database (per-tenant, not hardcoded)
  const { data: templateConfig, error } = await supabase
    .from("tenant_notification_templates")
    .select("twilio_content_sid")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .eq("template_name", template)
    .eq("status", "approved")
    .single();

  if (error || !templateConfig?.twilio_content_sid) {
    throw new Error(
      `WhatsApp template not approved: ${template} (${error?.message})`,
    );
  }

  const message = await client.messages.create({
    from: config.twilioWhatsAppNumber,
    to: `whatsapp:${prefs.whatsapp_number}`,
    contentSid: templateConfig.twilio_content_sid,
    contentVariables: JSON.stringify(variables),
  });

  return {
    channel: "whatsapp",
    external_msg_id: message.sid,
    status: "sent",
    recipient_phone: prefs.whatsapp_number,
    template_name: template,
  };
}
```

### Phase 1E — Payments (Days 27–34)

> **V1 locked decisions (2026):** **Grow (Meshulam)** is the production default for IL bundled tenants (`payment_provider = 'grow'`). **Stripe** remains in the provider registry for future split/US tenants — **not V1 shipping target** (no Stripe Connect in V1). **Guest checkout is shipped:** public `/enrol` + signed **`enrolment_token`** (`WaiverToken` JWT) for `create-checkout` without a Supabase session — **not** a `checkout_session` DB table. Authenticated checkout remains supported for signed-in families. First DB slice: `payments`, `invoice_sequences`, `next_invoice_number()`, tenant payment-provider columns — **`discount_rules` and `teacher_pay_records` deferred.** Tenant keys entered via **admin settings UI**; secrets encrypted at rest (Vault preferred). Webhooks resolve tenant via **`metadata.tenant_id`** on charge events. **Payment dunning shipped (2026-07):** renewal emails via `applyBillingScheduleDunningFailure` + `_shared/collections/`; enrolment unpaid Day 3/7/14 via `run-enrolment-payment-dunning` — see [payment-dunning-notifications.md](docs/plans/payment-dunning-notifications.md), [enrolment-payment-dunning.md](docs/plans/enrolment-payment-dunning.md).

All Stripe API calls creating or modifying payment objects happen in Edge Functions. Frontend receives `clientSecret` only.

Key Edge Functions:

- `create-checkout` (V1): **`resolveCheckoutSession()`** — Supabase JWT **or** signed `enrolment_token`; loads offering + tenant; **`resolveOfferingPrice()`** (§2.5.1); creates PaymentIntent with `amount = totalMinor` and VAT breakdown in metadata; returns `clientSecret` (invoice number assigned on webhook success, not at intent creation)
- `create-enrolment-intake`: service-role intake for guest wizard (`guest_enrolment_*` RPCs); creates family + `pending_payment` engagement server-side
- `create-payment-intent`: legacy alias — align with `create-checkout` or remove; **frontend uses `create-checkout` only**
- `stripe-webhook`: idempotent handler for `payment_intent.succeeded`, `payment_intent.payment_failed`, `invoice.payment_failed`, `customer.subscription.deleted`; persists metadata pretax/vat/total into `payments` without recalculating from catalogue price

#### Payment state machine (Issue #8 clarification: subscription vs payment intent)

⚠️  **WARNING — Data Integrity:**
PaymentIntent status is the authoritative source of truth. Subscription objects are secondary.
If ever out of sync, re-fetch PaymentIntent from Stripe and treat it as correct.
Never trust a cached subscription status when PaymentIntent disagrees.

**Single source of truth:** PaymentIntent status is authoritative. Subscription objects are informational only for recurring billing.

```
Payment flow (V1 — one-time class enrolment):
1. Frontend: resolveOfferingPrice() → show total (and optional VAT breakdown)
2. Edge Function create-checkout: Create PaymentIntent (amount = totalMinor), return clientSecret
3. Frontend: Confirm payment with Stripe
4. Stripe webhook payment_intent.succeeded:
   → payments table: INSERT with PaymentIntent.id as stripe_payment_intent_id
   → enrolments table: UPDATE status='active'
   → audit_log: INSERT
   → send-notification: confirmation email + WhatsApp

Retry logic:
- payment_intent.payment_failed → store error in payments.failure_reason
- Stripe auto-retries based on dashboard settings
- Manual retry via admin: create new PaymentIntent (do not reuse failed ID)

Subscription flow (V2):
- Used only for recurring monthly charges (not in V1)
- If present, subscription.status is secondary to latest PaymentIntent.status
- Cancelled subscription does NOT automatically cancel active enrolment — admin action required
```

On payment success:

1. Enrolment → `active`
2. Insert into `payments` with VAT breakdown
3. Generate invoice number via `next_invoice_number()`
4. Insert into `audit_log`
5. Trigger `send-notification` for confirmation

Dunning (V1 — app-owned email ladder; provider-agnostic):

**Renewal track** (`billing_schedules` SSOT — obligation on schedule row):

```
Day 1:  First renewal charge attempt (run-monthly-billing)
Day 4:  Second attempt (+3d after failure) → PAYMENT_REMINDER email (attempt 1)
Day 8:  Third attempt (+4d after failure) → PAYMENT_REMINDER email (attempt 2)
After 3 failures: billing_status=suspended + PAYMENT_REMINDER email (attempt 3, suspend copy)
```

Implemented: `applyBillingScheduleDunningFailure` → `sendPaymentDunningReminder({ kind: 'renewal' })`; idempotency via `notification_log.variables.dunning_key`. Entry paths: `payment.failed` webhook, cron catch, missing saved token.

**Enrolment unpaid track** (`engagements.payment_dunning_*` SSOT — absolute calendar from `created_at`, Jerusalem):

```
Day 3:  PAYMENT_REMINDER (standard) — signed /enrol/pay link
Day 7:  PAYMENT_REMINDER (urgent)
Day 14: Cancel engagement + CLASS_CANCELLATION email (waiting list automation → V2.2 TODO)
```

Implemented: `run-enrolment-payment-dunning` cron (daily 03:00 Asia/Jerusalem); manual admin link (`send-admin-enrolment-link`) runs independently without incrementing dunning counters.

**Deferred:** WhatsApp dunning reminders (Twilio); provider-native smart retries (Grow dashboard).

### Phase 1F — Admin dashboard (Days 35–42)

Screens:

- **Overview:** today's classes, enrolments this term, revenue this month, outstanding payments, quick actions
- **People:** searchable directory, filter by status/class, export CSV
- **Classes:** by term, with occupancy bar and waiting list count
- **Payments:** transaction log with VAT column, filter by status/date; basic P&L (revenue vs expenses)
- **Expenses:** enter and categorise expenses; receipt upload to Supabase Storage
- **Notifications:** compose email blast; select recipients by class/level/all; WhatsApp blast for urgent items
- **Settings:** school profile, **tax** (`/admin/setup/tax` — `vat_rate`, `prices_include_vat`; not `/admin/setup/billing`, which is billing accounts), levels, terms, class requirements, discount rules, Stripe keys, external API keys (Morning/Green Invoice in V2.6), **waivers** (`/admin/setup/waivers` — manage `consent_templates`: list versions, create draft, preview PDF, promote draft→approved→active, archive; one active template per tenant at a time; view signed waivers per person; export evidence bundle for dispute resolution; add to `navigationConfig.ts` alongside tax/levels/terms)

### 6.y — Tenant settings hub (day-2 admin configuration)

**Route:** `/admin/setup/settings` — `tenant_admin` only.

**Purpose:** Ongoing edits after provisioning. Not industry onboarding (see §9 V3.0).

| Section | Editable fields | Notes |
| --- | --- | --- |
| School profile | `name` | `subdomain` read-only post-launch |
| Branding | `primary_color`, `accent_color` | `useThemeInjection` on cache invalidate |
| Language & region | `language_default`, `country`, `currency`, `phone_region` | Lock `currency` after first payment |
| Integrations | — | Cards → `/admin/setup/stripe`; Twilio/Resend when §6.x #4 ships |
| Tax | — | Card → `/admin/setup/tax` |
| Compliance | — | Card → `/admin/setup/waivers` (Phase 1F) |

**Excluded:** `business_preset`, `subdomain` edits, terminology overrides in v1 (wizard-only until second tenant).

**Phase D (label display wiring):** Complete. See [docs/plans/phase-d-display-wiring.md](docs/plans/phase-d-display-wiring.md). Former “D4 admin label editor” removed from Phase D — belongs in §9 V3.0.

### 6.x — Deferred backlog (post–V1 payment slice)

Items intentionally **not** in the first finance migration or V1 checkout scope:

1. **Stripe Connect** — `stripe_account_id` column may exist nullable; Connect onboarding is a later phase.
2. **`discount_rules` at checkout** — table defined in full schema; not required for first payment slice.
3. **Per-tenant Twilio/Resend** — migrate `send-notification` off platform env keys; fix client-supplied `tenantId` trust model.
4. **Multi-region** — `tenants.region` and routing (V3).
5. **Unenrol Phase 2 — post-payment withdrawal** — `active` → `withdrawn`; refund wizard (none / partial / full) with immutable negative `payments` rows; Stripe refund for online. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).
6. **Unenrol Phase 3 — parent withdrawal requests & refund policy** — parent-initiated request queue; tenant-configurable pro-rata rules; optional account credit. Depends on Phase 1G parent portal.
7. **Teachers admin UI** — `/admin/setup/teachers` CRUD, schema alignment, nav. V1 uses `staff` table + class-form `staff_id` only. See [§8 V2.11](#v211--teachers-admin-module).

**Shipped (V1):** Guest checkout + guest enrolment — [docs/plans/2026-06-02-guest-enrollment-portal-provisioning.md](docs/plans/2026-06-02-guest-enrollment-portal-provisioning.md) (`guest_enrolment_*` RPCs, `create-enrolment-intake`, signed `enrolment_token`, `/enrol` without login gate). Admin cancel pre-payment enrolment — [docs/plans/2026-06-02-unenrol-phase-1.md](docs/plans/2026-06-02-unenrol-phase-1.md). Age override + parent review — [docs/plans/2026-06-02-age-override-and-review-request.md](docs/plans/2026-06-02-age-override-and-review-request.md). Parent self-enrolment (Myself) — [docs/plans/parent-self-enrolment/00-overview.md](docs/plans/parent-self-enrolment/00-overview.md). **Payment dunning (renewal + enrolment unpaid)** — [docs/plans/payment-dunning-notifications.md](docs/plans/payment-dunning-notifications.md), [docs/plans/enrolment-payment-dunning.md](docs/plans/enrolment-payment-dunning.md) (`run-enrolment-payment-dunning`, Day 3/7/14).

Track live status in [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

### Phase 1G — Parent and student portals (Days 43–50)

**Parent portal (magic link):** Dashboard showing enrolled children + upcoming classes; payment history with invoice download; account settings; new enrolment.

**Adult student portal (magic link):** Same as parent portal but showing their own enrolments, payments, and upcoming sessions.

**Contact preference management (both portals):**

- Toggle WhatsApp opt-in
- Enter/verify WhatsApp number (OTP via Twilio Verify)
- Choose preferred channel
- Manage notification scope (which events trigger notifications)

---

## 7. V1 Production Deployment

### Pre-deployment checklist

```
DATABASE
[ ] All 26 migrations applied and verified in Supabase dashboard (see §4.2.0 index)
[ ] Types regenerated: pnpm db:types:all:local (or supabase gen types typescript --linked)
[ ] RLS verified: parent sees only own family; teacher sees only own tenant
[ ] Invoice sequences table seeded for your tenant
[ ] VAT rate set correctly on tenant row (0.17 if עוסק מורשה, 0 if עוסק פטור)
[ ] `prices_include_vat` matches how school quotes prices (default `true` for parent-facing schools)
[ ] pg_cron + pg_net extensions enabled; `cron.job` lists 7 scheduled jobs (02600)
[ ] Database GUCs set: app.settings.supabase_functions_url, app.settings.cron_secret (match Edge CRON_SECRET)

GROW (V1 default — IL bundled tenants)
[ ] Grow sandbox credentials saved via admin settings (bundled payments)
[ ] Grow webhook secret saved; inbound webhooks authenticated
[ ] handle-payment-event / handle-payment-document webhooks tested end-to-end
[ ] End-to-end test: charge → enrolment active → tax document issued (Grow mock or sandbox)

STRIPE (registry only — not V1 shipping target for IL)
[ ] If US/split tenant: webhook endpoint → stripe-webhook Edge Function
[ ] Events: payment_intent.succeeded, payment_intent.payment_failed (as applicable)

WHATSAPP
[ ] Twilio account set up with Israeli phone number
[ ] All message templates approved by Meta (allow 5 days)
[ ] Test WhatsApp message delivered to your own number
[ ] Opt-in collection and OTP verification tested in enrolment flow

EMAIL
[ ] Resend domain verified (SPF + DKIM)
[ ] All email templates tested to Gmail, Walla Mail, and Gmail Israeli accounts
[ ] Supabase Auth Magic Link template includes {{ .Token }} for login Code tab
[ ] Email OTP login tested cross-device (request on desktop, enter code on phone)

LEGAL
[ ] Privacy Policy live and linked in footer
[ ] Terms of Service live and linked at enrolment
[ ] Waiver text confirmed by lawyer and stored as accepted snapshot on each enrolment
[ ] Background checks on file for all teachers working with minors

SECURITY
[ ] tsc --noEmit: zero errors
[ ] All secrets in Supabase Vault / Edge Function secrets — none in code
[ ] CRON_SECRET + APP_URL set for scheduled edge jobs (dunning, billing, waiver, issue-document)
[ ] Source maps disabled in production Vite config
```

### Secrets configuration

```bash
# Edge Function secrets (platform + cron auth)
supabase secrets set \
  CRON_SECRET=<random-string> \
  APP_URL=https://your-app.example.com \
  RESEND_API_KEY=re_... \
  TWILIO_ACCOUNT_SID=AC... \
  TWILIO_AUTH_TOKEN=... \
  ANTHROPIC_API_KEY=sk-ant-...

# Cron HTTP jobs read DB GUCs (set in SQL Editor — not Edge secrets):
# ALTER DATABASE postgres SET app.settings.supabase_functions_url = 'https://<project-ref>.supabase.co';
# ALTER DATABASE postgres SET app.settings.cron_secret = '<same as CRON_SECRET>';

# Per-tenant payment keys: admin settings UI → encrypted on tenants row (Grow default for IL).
# Stripe keys on tenants row for future split/US tenants only — not V1 IL default.
# RESEND/TWILIO may remain platform-level until send-notification per-tenant migration (§6.x #3).
```

### Rollback plan

| Layer          | Method                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Frontend       | Vercel → Deployments → promote previous (instant)                                               |
| Database       | Supabase point-in-time recovery (Pro plan). Additive-only migrations mean this is rarely needed |
| Edge Functions | Redeploy previous git commit                                                                    |

---

## 8. V2 Roadmap

### V2.1 — Attendance and make-up classes

Teacher attendance register per session. Absent students automatically credited. Parent self-service make-up booking.

### V2.2 — Waiting list automation

Database webhook on enrolment cancellation → `process-waiting-list` Edge Function → offer sent via WhatsApp + email with 48-hour payment link.

**Prerequisite:** Pre-payment cancellation (Unenrol Phase 1) must emit a reliable cancellation event; see [docs/plans/2026-06-02-unenrol-phase-1.md](docs/plans/2026-06-02-unenrol-phase-1.md).

### V2.3 — Class cancellation cascade

Admin cancels session → makeup credits created → cancellation notification sent via preferred channel → substitute teacher pool notified.

### V2.4 — Annual re-enrolment

End-of-term automated flow: email + WhatsApp to all current families, pre-filled re-enrolment, one-tap confirm + pay.

### V2.5 — Voice call chatbot

```
Phone call → Twilio Voice → Deepgram STT → Claude API → Twilio TTS → caller
```

Handles: class schedule questions, enrolment process, pricing, waitlist queries. Payment: sends WhatsApp/email link during call — never collects card details by voice (PCI compliance). Conversation transcripts logged (without PII in Anthropic prompts).

Build on top of existing WhatsApp/Twilio account (same vendor, new product).

### V2.6 — Morning API / Green Invoice integration

**Provider:** [Morning](https://www.greeninvoice.co.il/) (Green Invoice / חשבונית ירוקה) REST API for Israeli tax invoices.

**Boundary (see §2.5.2):** Manage Studio computes VAT once at enrolment/checkout; Morning **documents** that transaction — it does not redefine the charge.

Flow:

1. `stripe-webhook` (or offline payment path) inserts `payments` with final `pretax_amount_minor`, `vat_amount_minor`, `total_amount_minor`.
2. Edge Function `issue-tax-document` (new) reads the `payments` row + payer details; calls Morning API with those amounts.
3. Store `document_id` and PDF URL in `payments.invoice_url` (and optional `external_invoice_id`).
4. On Morning failure: queue retry; never change `payments` amounts — fix mapping or rounding in `resolveOfferingPrice()` only.

**Not in Morning adapter:** catalogue pricing, enrolment quotes, or Stripe `PaymentIntent.amount` — those stay in Manage Studio + Stripe.

Accountant monthly export: V2.7 CSV from `payments` / `expenses` (can include Morning document IDs).

### V2.7 — QuickBooks / Xero export

Date-range CSV from `payments` + `expenses` tables in standard import format. Admin downloads from finance dashboard. Format documented for accountant on day one even before the UI exists.

### V2.8 — Apparel shop

Stripe payment for physical items. Products linked to class levels. Stock tracking. Admin marks orders as collected/dispatched.

### V2.9 — Document management

Medical form PDF upload. Photo/media consent per event. GDPR deletion request flow. *(Digital waiver with full text snapshot is in V1 self-hosted flow — §2.7.1, §4.2.9. External e-sign vendor integration is permanently out of scope.)*

### V2.10 — Progress reports

Teacher writes end-of-term note per student. Admin reviews. System sends PDF to family via email and stores in student record.

### V2.11 — Teachers admin module

Admin CRUD for the `staff` table at **`/admin/setup/teachers`**: name, contact, contract type (`hourly` \| `salary` \| `freelance`), optional hourly rate. Delete blocked when assigned to offerings. Fix shared `StaffSchema` drift with DB.

**V1 already shipped (foundation only):** `staff` table + RLS, `offerings.staff_id` FK, `TeacherService` / `useTeachers`, optional teacher dropdown on class create/edit — staff rows via seed or direct insert until this module ships.

**Out of scope for V2.11:** `teacher` role login portal, payroll runs, `teacher_pay_records`, linking `user_profile_id` to auth invites.

**Plan:** [docs/plans/teachers-admin-module.md](docs/plans/teachers-admin-module.md)

### V2.12 — Native scheduling (calendar + slot booking + Google Calendar)

**Status:** Core shipped (S0–S4). Penalties / no-show (S5) deferred.

**Calendar (FullCalendar):** Public `/classes` timetable for class offerings; appointments use `/book` (not the class calendar for checkout).

**Slot booking:** `offering_type = 'appointment'` services, admin hours/settings/services, client `/book[/:offeringId]`, hold → `prepare-booking-checkout` → existing pay spine → optional guest waiver (`get-waiver-engagement`). Appointment confirmation emails to client + tenant admins. Client post-pay “Add to Google Calendar” / `.ics` (no OAuth).

**Google Calendar integration:** Per-tenant OAuth (`tenant_admin`); HMAC-signed `state`; `freebusy.query` subtracts busy time (fail-closed); on confirm (`active` / `pending_waiver`), `events.insert` + `google_event_id`; cancel deletes; admin can sync manually. Tokens encrypted via pgcrypto RPCs.

**Not in scope:** Cal.com; Google Appointment Schedule embed as checkout; AI scheduling assistant; per-staff OAuth (V2.11+).

**Plans:** [docs/plans/scheduling/00-overview.md](docs/plans/scheduling/00-overview.md), [docs/plans/scheduling/google-calendar-integration.md](docs/plans/scheduling/google-calendar-integration.md), [docs/plans/scheduling/deployment-and-testing.md](docs/plans/scheduling/deployment-and-testing.md)

---

## 9. V3 SaaS Roadmap

### V3.0 — Operator tenant provisioning wizard

**When:** After ballet V1 is feature-complete, before second-industry validation.

**Route:** `/platform/onboard` — `super_admin` only.

**Steps:** (1) identity + `business_preset`, (2) optional `labels` overrides, (3) branding, (4) locale, (5) tax, (6) integrations (skippable), (7) starter data seed, (8) review + `provision_tenant` RPC.

**Backend:** `check_subdomain_available`, `provision_tenant` (insert tenant + seed expense categories). Admin account: invite signup with `subdomain` in auth metadata; promote to `tenant_admin`.

**Field matrix (wizard vs admin hub):**

| Field | Wizard | Admin hub |
| --- | :---: | :---: |
| `name` | Yes | Yes |
| `subdomain` | Yes | Read-only |
| `business_preset` | Yes | Read-only |
| `labels` | Yes (optional) | Deferred v1 |
| `primary_color`, `accent_color` | Yes | Yes |
| `language_default`, `country`, `currency`, `phone_region` | Yes | Yes |
| `vat_rate`, `prices_include_vat` | Yes | Yes (tax page) |
| Stripe keys | Yes (skippable) | Yes |
| Twilio/Resend | Yes (skippable) | Yes (§6.x #4 prerequisite) |
| Levels/terms/offerings | Optional seed | Existing setup pages |
| Consent templates | First draft optional | `/admin/setup/waivers` CRUD |

See [docs/plans/v3-0-operator-onboarding-wizard.md](docs/plans/v3-0-operator-onboarding-wizard.md).

### V3.1 — Self-service tenant onboarding

`signup.yoursystem.com` — school name, subdomain, plan selection, admin account creation, guided setup wizard. Reuses V3.0 step components with public signup entry point.

### V3.2 — White-label theming

Tenant config drives: logo, primary colour, accent colour, `language_default`, font choice (limited to 3 options). **Direction and locale strings are derived in the app** from language + country, not stored on `tenants`. Applied as CSS custom properties at app init.

### V3.3 — Subscription billing for schools

Your Stripe account (separate from tenant Stripe accounts) charges schools monthly. Plans: Trial (free, 30 students), Basic (₪299/month, 100 students), Pro (₪599/month, unlimited).

### V3.4 — Feature flags

**Shipped (V1):** `feature_definitions` + `tenant_feature_overrides` + `get_tenant_features()` — see `packages/shared/src/config/feature-registry.ts` and migration `03000`. Used to roll out modules (e.g. native scheduling, calendar view) by plan/vertical and per-tenant overrides.

Legacy note: Cal.com keys (`scheduling:appointments.calcom`, `scheduling:atoms.platform`) are **deprecated** — successor `scheduling:booking.client` (migration `02800`).

### V3.5 — Super-admin dashboard

All tenants: plan, student count, MRR, last active. Drill-down per tenant. Plan management. Impersonation for support (logged to audit_log).

### V3.6 — Communication drafting AI

Admin describes intent in natural language → Claude drafts email or WhatsApp message → admin reviews in split-pane editor → sends via existing notification system.

---

## 10. AI Integration Specification

✅ **Cross-reference:** AI interactions are logged in the `ai_log` table (defined in [Section 4, Migration 016](#migration-016--ai-log)). Every API call records system context, input/output hashes, token usage, and compliance flags.

> AI features are modules. The system is fully functional without them.
> No AI feature touches payment logic or enrolment state transitions.

### 10.0 AI Decision Logging and HITL Policy

**Scope of human-in-the-loop (HITL) requirement — AI-generated actions only:**

The `_instructions.md` mandates HITL and `approvedBy` for "financial or administrative logic." This applies to **AI-generated actions only** — not to Stripe payment processing, which has its own confirmation flow and is never AI-driven.

| AI feature | HITL mechanism |
|---|---|
| Communication drafting | Admin reviews draft in split-pane editor before sending |
| Voice bot enrolment | Creates `admin_review` enrolment status; admin confirms before activating |
| Finance narrative | Read-only summary; no automated action taken |
| Chatbot | Answers questions only; cannot change any system state |

**Confidence threshold:** The Claude API does not return a numeric confidence score. Apply HITL unconditionally for all AI-generated administrative actions — do not attempt to infer confidence from response text.

**`ai_decision_logs` mapping:** The `_instructions.md` reference to `ai_decision_logs` maps to the `ai_log` table defined in Migration 016. The `flagged` column is the mechanism for marking items requiring human review. Every AI action logs here; flagged rows surface in the admin dashboard for review.

### Feature 1 — Enrolment Q&A chatbot (V1)

**Pattern:** Context injection (structured school data → Claude → answer)

```typescript
// supabase/functions/ai-chatbot/index.ts
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: buildSystemPrompt(tenantContext), // School name, classes, FAQ, policies
  messages: [...conversationHistory, { role: "user", content: message }],
});
```

**Safety rules:**

- Never send student names or identifiable data to Claude — use anonymised references
- Claude cannot change enrolment state — it answers questions only
- All prompts and responses logged to `ai_log` table (separate from notification_log)
- If Claude cannot answer confidently, it directs caller to contact school directly

### Feature 2 — Voice chatbot (V2)

Twilio Voice → Deepgram STT → Claude API → Twilio TTS. Same system prompt as text chatbot. Payment: voice sends payment link via WhatsApp/SMS during call. Never collects card details.

Latency target: under 2 seconds perceived response time. Achieve by:

- Streaming Claude response
- Sending first TTS chunk before full response complete
- Pre-loading common responses

### Feature 3 — Communication drafting (V2)

Admin input → Claude → drafted message → split-pane review → send.
Model: `claude-sonnet-4-6`, max_tokens: 500. Tone configured per tenant in system prompt.

### AI integration principles (your learning path through this project)

| Pattern                     | Where used               | What you learn                               |
| --------------------------- | ------------------------ | -------------------------------------------- |
| Context injection           | Chatbot (V1)             | Structured data → LLM; prompt engineering    |
| Streaming responses         | Voice bot (V2)           | Latency management; async streaming          |
| Tool use / function calling | Voice enrolment (V3)     | Agentic AI; reliability constraints          |
| Multi-modal                 | Document processing (V3) | Images + text; receipt scanning for expenses |

Each pattern is progressively more complex. By V3 you will have real production AI integration experience across four distinct patterns.

### 10.4 AI Resilience (The Circuit Breaker)

- **Graceful Degradation:** If the Claude API returns a 500 or exceeds a 10s timeout, the UI must hide the "AI Assistant" and revert to a standard "Search & Filter" interface.
- **Cost Guardrails:** Every tenant has a `monthly_token_quota`. If reached, the AI module disables itself for that tenant until the next billing cycle.

---

## 11. Testing Strategy

### 11.1 Unit Tests — pure functions, no mocks needed

```typescript
// Test class requirement evaluation
describe("checkClassRequirements", () => {
  it("blocks a 5-year-old from a min_age:7 class", () => {
    const req: ClassRequirement = {
      requirement_type: "min_age",
      value: "7",
      display_text: "Ages 7+",
      is_hard_block: true,
    };
    const person = { date_of_birth: "2020-01-01" }; // age 5
    const result = checkClassRequirements([req], person as Person);
    expect(result.blocked).toBe(true);
  });

  it("flags but does not block admin_approval requirement", () => {
    const req: ClassRequirement = {
      requirement_type: "admin_approval",
      value: "true",
      display_text: "Requires teacher approval",
      is_hard_block: false,
    };
    const result = checkClassRequirements([req], {} as Person);
    expect(result.blocked).toBe(false);
    expect(result.flagged).toBe(true);
  });
});

// Test VAT calculation — packages/shared/src/pricing.ts
describe("calculateVat", () => {
  it("calculates 17% VAT correctly from inclusive gross", () => {
    const { pretax, vat, total } = calculateVat(1000, 0.17);
    expect(pretax).toBe(855); // 1000 / 1.17 rounded
    expect(vat).toBe(145);
    expect(total).toBe(1000);
  });
});

describe("resolveOfferingPrice", () => {
  it("inclusive: charge equals list price_minor", () => {
    const r = resolveOfferingPrice(
      { price_minor: 24000 },
      { vat_rate: 0.17, prices_include_vat: true },
    );
    expect(r.chargeMinor).toBe(24000);
    expect(r.pretaxMinor + r.vatMinor).toBe(24000);
  });
  it("exclusive: charge adds VAT to list", () => {
    const r = resolveOfferingPrice(
      { price_minor: 24000 },
      { vat_rate: 0.17, prices_include_vat: false },
    );
    expect(r.chargeMinor).toBe(28080);
  });
});

// Test notification channel routing
describe("resolveNotificationChannels", () => {
  it("sends to email only when WhatsApp not verified", () => {
    const prefs = {
      email_opted_in: true,
      whatsapp_opted_in: true,
      whatsapp_verified: false,
    };
    const channels = resolveChannels(prefs);
    expect(channels).toEqual(["email"]);
  });
});
```

### 11.2 RLS Security Tests

```sql
-- Must run before every production deploy
BEGIN;
  SET LOCAL role TO authenticated;
  SET LOCAL "request.jwt.claims" TO '{"sub": "parent-a-uuid"}';
  -- Parent A must see exactly their family's people, zero others
  SELECT count(*) FROM people;
  -- Must equal number of people in parent A's family only
ROLLBACK;
```

### 11.3 E2E Tests (Playwright) — V2 priority

Critical paths only:

1. Full enrolment → payment → WhatsApp confirmation received
2. Class cancelled → makeup credit created → parent notified on preferred channel
3. Adult student self-enrols and accesses student portal

### 11.4 Accessibility Tests — WCAG 2.1 Level AA (merged into Definition of Done)

**Test file:** `apps/web/e2e/accessibility-compliance.spec.ts`

**Scope:** All customer-facing pages (no admin panels in V1). Tests run on every PR; zero violations required.

````typescript
import { test, expect } from "@playwright/test";
import { injectAxe, checkA11y } from "axe-playwright";

/**
 * WCAG 2.1 Level AA Compliance Tests
 * Scope: Israeli community centers (דינ נגישות לאנשים עם מוגבלות, 1998)
 * Required: All tests pass before merge; manual NVDA Hebrew smoke test pre-deployment
 */

test.describe("Heading Structure (WCAG 2.4.1)", () => {
  test("no level skips (h1 → h3)", async ({ page }) => {
    await page.goto("/enrolment");
    const headings = await page.locator("h1, h2, h3, h4, h5, h6").all();

    for (let i = 1; i < headings.length; i++) {
      const current = parseInt(
        await headings[i].evaluate((el) => el.tagName[1]),
      );
      const previous = parseInt(
        await headings[i - 1].evaluate((el) => el.tagName[1]),
      );
      expect(current - previous).toBeLessThanOrEqual(1);
    }
  });

  test("exactly one h1 per page", async ({ page }) => {
    await page.goto("/");
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBe(1);
  });
});

test.describe("Form Accessibility (WCAG 1.3.1)", () => {
  test("all inputs have associated labels", async ({ page }) => {
    await page.goto("/enrolment");
    const inputs = await page.locator("input, select, textarea").all();

    for (const input of inputs) {
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const parent = await input.evaluate(
        (el) => el.parentElement?.textContent,
      );

      expect(id || ariaLabel || parent?.length).toBeTruthy();
    }
  });

  test("form validation errors announce via aria-live", async ({ page }) => {
    await page.goto("/enrolment");
    await page.click('button[type="submit"]');

    const liveRegion = await page.locator("[aria-live]").first();
    const errorText = await liveRegion.textContent();
    expect(errorText).toBeTruthy();
  });
});

test.describe("Modal Focus Management (WCAG 2.4.3)", () => {
  test("focus trap: Tab cycles within modal", async ({ page }) => {
    await page.goto("/classes");
    await page.click('button:has-text("Add Class")');

    const modal = page.locator('[role="dialog"]');
    const focusableElements = await modal
      .locator("button, [href], input, select, textarea, [tabindex]")
      .all();

    // Tab to first element
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("type")),
    ).toBeTruthy();

    // Escape closes modal
    await page.keyboard.press("Escape");
    expect(await modal.isVisible()).toBe(false);
  });
});

test.describe("Color Contrast (WCAG 1.4.3)", () => {
  test("text contrast ratio >= 4.5:1", async ({ page }) => {
    await injectAxe(page);
    const results = await page.evaluate(() => (window as any).axe.run());

    const contrastViolations = results.violations.filter(
      (v) => v.id === "color-contrast",
    );
    expect(contrastViolations).toHaveLength(0);
  });
});

test.describe("Keyboard Navigation (WCAG 2.1.1)", () => {
  test("tab through entire page without focus loss", async ({ page }) => {
    await page.goto("/");
    let focusedElement = null;

    for (let i = 0; i < 50; i++) {
      await page.keyboard.press("Tab");
      focusedElement = await page.evaluate(
        () => document.activeElement?.tagName,
      );
      expect(focusedElement).not.toBe("BODY"); // Focus must be on an element
    }
  });

  test("all interactive elements keyboard accessible", async ({ page }) => {
    await page.goto("/classes");
    const buttons = await page.locator('button, [role="button"]').all();

    for (const button of buttons) {
      const tabindex = await button.getAttribute("tabindex");
      const role = await button.getAttribute("role");
      expect(tabindex !== "-1" || role === "button").toBeTruthy();
    }
  });
});

test.describe("Semantic HTML & ARIA (WCAG 1.3.1)", () => {
  test("landmarks present: main, nav", async ({ page }) => {
    await page.goto("/");
    const main = await page.locator('main, [role="main"]').isVisible();
    expect(main).toBe(true);
  });

  test("buttons use <button> not <div>", async ({ page }) => {
    await page.goto("/");
    const divButtons = await page.locator("div[onclick]").count();
    expect(divButtons).toBe(0);
  });

  test("list items in lists (<li> in <ul>/<ol>)", async ({ page }) => {
    await page.goto("/classes");
    const orphanItems = await page
      .locator("li:not(ul > li):not(ol > li)")
      .count();
    expect(orphanItems).toBe(0);
  });
});

test.describe("RTL & Hebrew Support (WCAG 3.1.1)", () => {
  test('lang="he" and dir="rtl" on html element', async ({ page }) => {
    await page.goto("/");
    const html = await page.locator("html").evaluate((el) => ({
      lang: el.getAttribute("lang"),
      dir: el.getAttribute("dir"),
    }));
    expect(html.lang).toBe("he");
    expect(html.dir).toBe("rtl");
  });

  test("tab order follows visual RTL layout", async ({ page }) => {
    await page.goto("/");
    const elements = await page.locator('button, input, [role="button"]').all();

    // In RTL, the first focusable element should be positioned on the right side
    // of the viewport. viewportSize() returns { width, height } — not a number.
    if (elements.length > 0) {
      const firstBox = await elements[0].boundingBox();
      const viewport = page.viewportSize();
      if (firstBox && viewport) {
        // Element's left edge (x) should be in the right half of the viewport
        expect(firstBox.x).toBeGreaterThan(viewport.width / 2);
      }
    }
  });
});

test.describe("ARIA Patterns", () => {
  test("form groups have fieldset + legend", async ({ page }) => {
    await page.goto("/enrolment");
    const fieldsets = await page.locator("fieldset").all();

    for (const fs of fieldsets) {
      const legend = await fs.locator("legend").isVisible();
      expect(legend).toBe(true);
    }
  });

  test("native inputs have labels; custom ARIA widgets have aria-checked", async ({ page }) => {
    // Native <input type="checkbox"> and <input type="radio"> use the DOM `checked`
    // property — NOT aria-checked. That attribute is only for custom ARIA widgets
    // (elements with role="checkbox" or role="radio").
    // This test verifies: (a) native inputs have associated labels, and
    // (b) any custom ARIA widgets correctly use aria-checked.
    await page.goto("/enrolment");

    // Native inputs must have an associated label (via id+for, aria-label, or aria-labelledby)
    const nativeInputs = await page
      .locator('input[type="checkbox"], input[type="radio"]')
      .all();
    for (const input of nativeInputs) {
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const ariaLabelledBy = await input.getAttribute("aria-labelledby");
      expect(
        id || ariaLabel || ariaLabelledBy,
        "Native input must have id (for label[for]), aria-label, or aria-labelledby"
      ).toBeTruthy();
    }

    // Custom ARIA widgets must use aria-checked
    const customCheckboxes = await page
      .locator('[role="checkbox"], [role="radio"]')
      .count();
    const customWithAriaChecked = await page
      .locator('[role="checkbox"][aria-checked], [role="radio"][aria-checked]')
      .count();
    expect(customCheckboxes).toBe(customWithAriaChecked);
  });
});

### 11.4.1 Waiver Evidence Reliability and Legal Tests (Self-Hosted)

**A. Evidence immutability**
- Attempting UPDATE or DELETE on `waiver_evidence` must fail (trigger raises exception).
- Corrections create new evidence rows; prior rows transition to `superseded` via new `waiver_events` entry only.

**B. Hash integrity**
- Stored `consent_version_hash` must match SHA-256 of `wording_snapshot`.
- Stored `pdf_sha256` must match SHA-256 of file at `pdf_storage_path`.
- `record_hmac` must recompute correctly against the canonical JSON spec (§4.2.9) using the key version stored in `hmac_key_version`.

**C. Idempotency**
- Calling `sign_waiver()` RPC twice with the same `idempotency_key` returns the same `waiver_evidence.id` without creating a second row.

**D. view_token enforcement**
- `accept-waiver` Edge Function must reject submissions with no `view_token`.
- `accept-waiver` must reject a `view_token` older than 900 seconds.
- `accept-waiver` must reject a tampered `view_token` (wrong HMAC).
- `accept-waiver` must reject a `view_token` for a different `person_id` or `consent_template_id`.

**E. Enrolment gate enforcement**
- Minor enrolment cannot become `active` while no valid `signed` evidence exists for the current template version.
- Adult enrolment follows tenant waiver policy.

**F. RLS and access controls**
- Parents/students can SELECT only their own `waiver_evidence` and `waiver_events`.
- Direct INSERT to `waiver_evidence` by an authenticated (non-service_role) session must be rejected by RLS.
- Tenant admins can access only their own tenant records.
- Cross-tenant SELECT must return empty set.
- PDF signed URLs must not be obtainable without Edge Function authorization check.

**G. Version re-sign flow**
- When active `consent_templates` version changes, affected participants require new acceptance; prior evidence transitioned to `superseded`.

**H. Audit trail completeness**
- Every `accepted` event in `waiver_events` must have a matching `audit_log` row with `entity_type = 'waiver_evidence'`.
- `people.waiver_accepted_at` and `people.waiver_version` must be updated atomically with the `waiver_evidence` insert inside `sign_waiver()`.

```typescript
// test/waiver/evidence_integrity.test.ts
test('Duplicate idempotency key returns same evidence id', async () => {
  const key = crypto.randomUUID();
  const first = await supabase.rpc('sign_waiver', { ...payload, p_idempotency_key: key });
  const second = await supabase.rpc('sign_waiver', { ...payload, p_idempotency_key: key });
  expect(first.data).toBe(second.data);
});

test('waiver_evidence UPDATE is rejected', async () => {
  const { error } = await supabase
    .from('waiver_evidence')
    .update({ signed_by_name: 'Tampered' })
    .eq('id', evidenceId);
  expect(error).toBeTruthy();
});

test('accept-waiver rejects expired view_token', async () => {
  const expiredToken = generateViewToken(personId, templateId, Date.now() - 901_000);
  const res = await fetch(`${EDGE_BASE}/accept-waiver`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ ...payload, view_token: expiredToken }),
  });
  expect(res.status).toBe(401);
});

test('direct authenticated INSERT to waiver_evidence is blocked by RLS', async () => {
  const { error } = await supabaseParent
    .from('waiver_evidence')
    .insert({ tenant_id: tenantId, person_id: personId, /* ... */ });
  expect(error?.code).toBe('42501');  // insufficient_privilege
});
```

### 11.5 Advanced Reliability Gates (Required for V1/V2)

#### **A. Multi-Tenant Security (RLS) Tests**
Ensure no data "leaks" between different schools (tenants).
- **Tool:** Vitest + Supabase Service Role (for setup) + Anon Client (for testing).
- **Requirement:** Create two test tenants. Authenticate as Tenant A. Attempt to `SELECT`, `UPDATE`, and `DELETE` from Tenant B’s `people` and `payments` tables.
- **Pass Criteria:** Every cross-tenant attempt must return an empty set or a `403 Forbidden` error.
Verify that Row Level Security (RLS) prevents cross-tenant data leaks.
```typescript
// test/security/rls_leak.test.ts
test('Tenant A cannot access Tenant B student data', async () => {
  const { data, error } = await supabaseTenantA
    .from('people')
    .select('*')
    .eq('tenant_id', tenantB_ID);

  expect(data).toHaveLength(0);
  expect(error).toBeDefined(); // Should return 403 or empty depending on policy
});

#### **B. Payment Idempotency & Webhook Resilience**
Prevent double-charging or duplicate invoicing during network instability.
- **Tool:** Playwright API testing.
- **Requirement:** Mock a Stripe `invoice.paid` event. Send the identical payload to the `/api/webhooks/stripe` endpoint twice in rapid succession.
- **Pass Criteria:** The `payments` table must contain exactly one record, and the `invoice_sequence` must increment exactly once.

```typescript
// test/integration/webhooks.test.ts
test('Stripe webhook is idempotent', async () => {
  const payload = mockStripeEvent('invoice.paid', { amount: 5000, id: 'evt_123' });
  const headers = { 'stripe-signature': 'valid_sig' };

  // Send twice to simulate network retry
  await request(app).post('/api/webhooks/stripe').set(headers).send(payload);
  const res = await request(app).post('/api/webhooks/stripe').set(headers).send(payload);

  // Verify exactly one payment created (idempotency key prevents duplicate)
  expect(res.status).toBe(200);
  const payments = await db.from('payments').select('*').eq('stripe_id', payload.id);
  expect(payments).toHaveLength(1); // Crucial: must only be 1
});
```

#### **C. AI Module "Golden Prompt" Evaluations (Evals)**
Verify the AI doesn't hallucinate syllabus rules or enrollment eligibility.
- **Tool:** Custom script (or Promptfoo) using `test_cases.json`.
- **Requirement:** Run 10 "Golden Prompts" (e.g., "Student age 5, class min_age 7, can they enroll?").
- **Pass Criteria:** AI output must match the expected `eligibility: false` logic 100% of the time. This test must run whenever the System Prompt or Model version changes.

```typescript
// test/ai/syllabus_eval.test.ts
const goldenPrompts = [
  { input: "Enroll student age 5 in Grade 2 (min_age 7)", expected: "INELIGIBLE_AGE" }
];

test.each(goldenPrompts)('AI Eligibility logic: %s', async ({ input, expected }) => {
  const result = await aiAgent.evaluateEnrollment(input);
  expect(result.code).toBe(expected);
});
```

#### **D. Legal Privacy & Anonymisation Audit**
Verify that "Right to be Forgotten" logic works without breaking accounting history.
- **Tool:** Unit test.
- **Requirement:** Trigger the `anonymise_student` function.
- **Pass Criteria:** 1. `people.full_name` and `people.contact_info` must be replaced with "DELETED_USER".
  2. `payments.amount` and `payments.created_at` must remain unchanged.
  3. The record's `anonymised_at` timestamp must be present.

```typescript
// test/legal/privacy.test.ts
test('Anonymization destroys PII but keeps financial data', async () => {
  const person = await db.from('people').select('*').single();
  await anonymiseUser(person.id);

  const updated = await db.from('people').select('*').eq('id', person.id).single();
  expect(updated.full_name).toBe('DELETED_USER');
  expect(updated.email).toBeNull();

  const paymentCount = await db.from('payments').select('count').eq('person_id', person.id);
  expect(paymentCount).toBeGreaterThan(0); // Accounting trail must remain
});
```

#### **E. Data Residency Guardrail (UK Launch Only)**
- **Requirement:** A CI check to ensure that when `process.env.REGION === 'UK'`, the `SUPABASE_URL` points specifically to the `eu-west-2` (London) instance.

```bash
# ci/region-check.sh — run this in CI before deploy
if [ "$REGION" = "UK" ]; then
  if [[ "$SUPABASE_URL" != *"eu-west-2"* ]]; then
    echo "ERROR: UK region must use eu-west-2 Supabase instance"
    exit 1
  fi
fi
```

#### **Phase 1C Acceptance Criteria: Accessibility**

Before a feature is considered "done", verify:
- [ ] Heading structure: no level skips, exactly 1 h1 per page
- [ ] Forms: all inputs labeled, validation errors announce
- [ ] Modals: focus trapped, Tab cycles, Escape closes
- [ ] Contrast: 4.5:1 min for text
- [ ] Keyboard: Tab through all elements, no focus loss
- [ ] Landmarks: <main> or role="main" present
- [ ] RTL: lang="he" dir="rtl", tab order matches visual layout
- [ ] ARIA: proper roles, aria-label/aria-labelledby on all inputs; aria-checked only on custom ARIA widgets (role="checkbox"/"radio"), not native inputs
- [ ] NVDA: manual smoke test passes (15 min, Hebrew mode, before merge)
- [ ] No axe-core violations: `pnpm run a11y:e2e`

**Manual smoke test checklist (15 minutes, Hebrew NVDA, before production):**

- [ ] Open in NVDA, switch to Hebrew mode
- [ ] Headings: H key cycles through headings; structure makes sense
- [ ] Forms: Tab enters input, arrow keys select radio options, validation errors announce
- [ ] Modals: Tab traps focus inside; Escape closes; focus returns to button
- [ ] Buttons: All interactive elements read as buttons/links, not generic text
- [ ] Images: Alt text present (or `aria-hidden` if decorative)
- [ ] Lists: List items announced with count ("1 of 5")
- [ ] Focus: Can always see where focus is; no focus disappearance
- [ ] Keyboard-only: No mouse required; all features work via Tab/Enter/Arrow keys
- [ ] RTL: Tab moves right-to-left in Hebrew mode; no visual layout breaks

---

## 12. Agent Working Instructions

### Before any coding session

1. Read Sections 1–5 of this document
2. Run `supabase gen types typescript --linked > packages/shared/src/database.types.ts`
3. Verify current branch: `feat/[module-name]` — never work directly on `main`
4. Check `git status` — no uncommitted changes from previous session

### Non-negotiable code rules

```typescript
// ✅ Always handle Supabase errors
const { data, error } = await supabase.from("people").select("*");
if (error) throw new Error(`Failed to fetch people: ${error.message}`);

// ❌ Never use data without checking error first

// ✅ Always use Zod for external data (webhooks, API responses, URL params)
const Payload = z.object({
  tenant_id: z.string().uuid(),
  amount: z.number().positive(),
});
const payload = Payload.parse(await req.json());

// ✅ Always use format utilities — never inline Intl calls
import { formatCurrency, formatDate } from "@shared/format";

// ✅ Always use logical Tailwind properties for RTL support
// ms- me- ps- pe- not ml- mr- pl- pr-

// ❌ Never put secret keys in frontend code or .env files committed to git
// ❌ Never collect card details except through Stripe Elements
// ❌ Never send identifiable student data (name, DOB) to Claude API
// ❌ Never hard-delete payment records — only anonymise
```

### Stripe-specific rules

- Never log `clientSecret` or any part of a Stripe key
- Always verify webhook signatures — reject unsigned requests with 400
- Always check idempotency before processing a webhook event
- Never create PaymentIntents from the frontend
- Always pass VAT amounts separately — never bundle into a single undifferentiated amount

### Commit format

```
feat(enrolment): add class requirement evaluation logic
fix(payments): correct VAT rounding for fractional agorot
test(requirements): add age constraint boundary cases
docs(schema): update migration 005 with requirement examples
```

### Branch strategy

```
main      → production
staging   → always matches what's going to production next
feat/*    → local work; PR to staging; staging to main
```

### Schema-first development — Agent implementation checklist

When implementing a feature that reads/writes database data, follow this workflow exactly.
This prevents the schema-mismatch cascade that occurred in Stream 1.

**Phase 1: Schema Discovery (5 min)**

Before writing any code:
- [ ] Locate migration in SPEC.md Section 4.2 (e.g., Migration 002 for people table)
- [ ] Read the full CREATE TABLE statement
- [ ] List all column names and types in a comment in your implementation file
- [ ] Note any special constraints or computed columns (`GENERATED ALWAYS AS`)

Example (for people table):
```typescript
// Schema source: SPEC.md Migration 002
// Columns: id (UUID), tenant_id (UUID), family_id (UUID?), user_profile_id (UUID?),
//   full_name (TEXT), date_of_birth (DATE?), is_minor (COMPUTED from date_of_birth),
//   gender (TEXT?), medical_notes (TEXT?), allergies (TEXT?),
//   emergency_contact_name (TEXT?), emergency_contact_phone (TEXT?),
//   photo_consent (BOOLEAN), media_consent (BOOLEAN),
//   status (TEXT: active|inactive|withdrawn),
//   waiver_accepted_at (TIMESTAMPTZ?), waiver_version (TEXT?),
//   anonymised_at (TIMESTAMPTZ?), created_at, updated_at
// NOTE: email is NOT on this table — it lives in contact_preferences and family_members
```

**Phase 2: Schema Import & Validation (2 min)**

```typescript
// CORRECT pattern:
import { PersonSchema } from '@shared/schemas';

const form = useForm({
  resolver: zodResolver(PersonSchema),
  defaultValues: { /* person data */ }
});

// WRONG pattern (never do this):
type Person = {
  firstName: string;  // ← assumption, not from schema
  lastName: string;   // ← assumption, not from schema
};
```

- [ ] Import schema from `@shared/schemas`, not local types
- [ ] Verify schema matches SPEC.md definition
- [ ] All form fields defined by schema, not intuition

**Phase 3: Component Implementation (10-15 min)**

Build ONE component only. Do not build dependent components yet.

Example for people feature:
- [ ] PersonForm.tsx (form for create/edit) — STOP here
- Do NOT yet: PeopleList.tsx, PeoplePage.tsx, usePersonSearch.ts hooks

**Phase 4: Build Validation Gate (5 min — MANDATORY)**

```bash
pnpm run build
```

**Possible outcomes:**

| Outcome | Action |
|---------|--------|
| ✅ Zero errors | Proceed to Phase 5 |
| ❌ TypeScript errors on form fields | Schema mismatch. Read SPEC.md migration again. Fix field names. Re-run build. |
| ❌ "Property X does not exist" | Form is using wrong field name. Check SPEC.md migration, update form field. |
| ❌ Build takes >15s or fails later | Likely schema type mismatch. Restart at Phase 2. |

**Do NOT proceed to next component until build succeeds.**

**Phase 5: Dependent Components (only after Phase 4 succeeds)**

Now safe to implement components that depend on the first:
- [ ] PeopleList.tsx (depends on Person type from PersonForm)
- [ ] PeoplePage.tsx (depends on both)
- [ ] usePersonSearch.ts (depends on Person type)

After each new component:
- [ ] Run `pnpm run build` (should still be zero errors)
- [ ] Proceed to next component only if build succeeds

**Phase 6: Linting & Final Validation**

```bash
pnpm run lint     # Zero errors
pnpm run build    # Zero errors
```

- [ ] `pnpm run lint` passes (zero errors)
- [ ] `pnpm run build` passes (zero errors)
- [ ] Feature ready for review

**Common mistakes to avoid:**

| Mistake | Prevention |
|---------|------------|
| Assume field names instead of reading schema | Read SPEC.md migration before writing component |
| Implement 5 components before first build | Run `pnpm run build` after component 1 |
| Ignore TypeScript errors, keep coding | Stop immediately on build errors. Fix before proceeding. |
| Copy field names from similar features | Each feature schema is unique. Verify against its migration. |
| Use local type definitions instead of Zod schemas | Always import schema from `@shared/schemas`. Never create local types. |

**Why this workflow:**

PersonForm without validation → 25 min dev + 2 hours debugging 80+ errors
PersonForm + immediate build → 30 min dev + 0 debugging

The 5-minute build gate eliminates 2 hours of downstream pain.

---

_Document version: 2.1_
_Replaces: v2.0_
_Key changes from v2.0: exhaustive switch on evaluateRequirement (all 8 requirement types);
invoice sequence year-boundary fully fixed with current_year column and reset logic;
Migration 009 rewritten to use category_id FK (coherent with Migration 014);
Migration 014 now contains executable FK and ALTER TABLE SQL, not comments;
Section 5.3 multi-region architecture replaced with honest V1 scope note;
Turborepo setup corrected to --package-manager pnpm;
People schema example corrected (removed non-existent email field, added all real columns);
aria-checked test replaced with correct native input label test;
RTL tab order test fixed (viewportSize().width, not viewportSize());
Phase 1C terms query pattern documented (status = active, not is_current);
HITL scope clarified in Section 10 (AI actions only, not payment processing);
aria-checked acceptance criteria corrected._
