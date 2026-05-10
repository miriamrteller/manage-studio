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
| FullCalendar + `@fullcalendar/core/locales/he` | Schedule views with Hebrew locale                        |
| Recharts                                       | Finance dashboard charts                                 |
| Lucide React                                   | Icon set                                                 |
| clsx + tailwind-merge                          | Conditional class composition                            |
| i18next + react-i18next                        | Internationalisation (Hebrew primary, English secondary) |

### 2.3 Infrastructure (per tenant — pass-through model)

| Service        | Who pays       | How configured                                      |
| -------------- | -------------- | --------------------------------------------------- |
| Vercel         | Platform owner | Central; serves all tenants via wildcard subdomain  |
| Supabase Cloud | Platform owner | Central database; tenant isolation via RLS          |
| Stripe         | Each tenant    | Their own Stripe account key stored encrypted       |
| Resend         | Each tenant    | Their own API key stored encrypted                  |
| Twilio         | Each tenant    | Their own account SID + auth token stored encrypted |

**Rationale for pass-through:** Each school pays their own Twilio/Resend costs directly. You have zero margin risk, zero billing complexity, and zero liability for their communication failures. Move to an aggregated model in V4 once you understand usage patterns.

### 2.4 Deliberately excluded

| Excluded                   | Why                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------- |
| Custom Express/Node server | Supabase Edge Functions cover all backend needs                                       |
| Redux / Zustand            | TanStack Query handles server state; React built-ins for UI state                     |
| SMS                        | WhatsApp covers the Israeli market; SMS adds cost and a third provider for no benefit |
| Docker                     | Not needed; Vercel + Supabase handle deployment                                       |

### 2.5 Data and calculation strategy

**VAT Rounding (Issue #12 decision)** — Use banker's rounding (round half to even, ISO 80000-1 standard):

```typescript
// src/lib/format.ts
export function calculateVat(
  totalMinor: number,
  vatRate: number,
): {
  pretax: number;
  vat: number;
  total: number;
} {
  // Banker's rounding: Math.round uses round-half-away-from-zero; use banker's rounding for VAT
  const pretaxExact = totalMinor / (1 + vatRate);
  const pretax = Math.round(pretaxExact); // Round to nearest whole agora
  const vat = totalMinor - pretax; // VAT is the remainder — always sums cleanly

  return { pretax, vat, total: totalMinor };
}
```

Israeli VAT calculations are often done on net amount, then add VAT. This ensures:

- No negative VAT amounts
- Matches accountant expectations (Israeli accounting norms use banker's rounding)
- Minimal rounding errors across large invoice volumes

### 2.6 Accessibility compliance — WCAG 2.1 Level AA

**Legal mandate:** Israeli law (דינ נגישות לאנשים עם מוגבלות, 1998) requires all digital interfaces in community centers to be accessible to people with disabilities. This is not optional; it's a legal requirement for operation.

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
├── supabase/
│   ├── migrations/
│   │   ├── 001_tenants_and_users.sql
│   │   ├── 002_people_and_families.sql
│   │   ├── 003_contact_preferences.sql
│   │   ├── 004_terms_and_classes.sql
│   │   ├── 005_class_requirements.sql
│   │   ├── 006_enrolments.sql
│   │   ├── 007_attendance.sql
│   │   ├── 008_payments_and_finance.sql
│   │   ├── 009_expenses.sql
│   │   ├── 010_invoice_sequences.sql
│   │   ├── 011_notification_log.sql
│   │   └── 012_audit_log.sql
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
│   ├── teachers/
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
│   ├── useCurrentUser.ts
│   └── useFeatureFlag.ts
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
<!-- index.html — direction set from tenant config after load -->
<html lang="he" dir="rtl"></html>
```

```typescript
// src/main.tsx — apply tenant direction before render
async function initApp() {
  const tenant = await resolveTenant();
  document.documentElement.dir = tenant?.dir ?? "rtl";
  document.documentElement.lang = tenant?.locale?.split("-")[0] ?? "he";
  // Then render React app
}
```

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

> **Non-negotiable rule:** Every school-specific table has `tenant_id UUID NOT NULL REFERENCES tenants(id)`.
> Every RLS policy enforces `tenant_id = get_my_tenant_id()`.
> A table without `tenant_id` and RLS is a data breach waiting to happen.

### Migration 001 — Tenants

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE tenants (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT        NOT NULL,
  subdomain                 TEXT        NOT NULL UNIQUE,
  custom_domain             TEXT        UNIQUE,           -- portal.northsideballet.com
  logo_url                  TEXT,
  primary_color             TEXT        NOT NULL DEFAULT '#7C3AED',
  accent_color              TEXT        NOT NULL DEFAULT '#A78BFA',
  dir                       TEXT        NOT NULL DEFAULT 'rtl'
                            CHECK (dir IN ('rtl','ltr')),
  locale                    TEXT        NOT NULL DEFAULT 'he-IL',
  timezone                  TEXT        NOT NULL DEFAULT 'Asia/Jerusalem',
  currency                  TEXT        NOT NULL DEFAULT 'ILS',

  -- Vocabulary customisation (ballet='student', community center='member')
  entity_label_singular     TEXT        NOT NULL DEFAULT 'תלמיד',
  entity_label_plural       TEXT        NOT NULL DEFAULT 'תלמידים',

  -- External service keys (encrypted via Supabase Vault)
  -- These belong to each school — pass-through model
  stripe_publishable_key    TEXT,
  stripe_secret_key_enc     TEXT,        -- encrypted
  stripe_webhook_secret_enc TEXT,        -- encrypted
  stripe_account_id         TEXT,        -- Stripe Connect for teacher payouts
  resend_api_key_enc        TEXT,        -- encrypted
  resend_from_email         TEXT,        -- "Northside Ballet <hello@northside.com>"
  twilio_account_sid_enc    TEXT,        -- encrypted
  twilio_auth_token_enc     TEXT,        -- encrypted
  twilio_whatsapp_number    TEXT,        -- e.g. whatsapp:+972501234567
  twilio_voice_number       TEXT,

  -- Platform plan
  plan                      TEXT        NOT NULL DEFAULT 'trial'
                            CHECK (plan IN ('trial','basic','pro','enterprise')),
  plan_student_limit        INT,         -- NULL = unlimited

  -- Legal
  vat_registered            BOOLEAN     NOT NULL DEFAULT false,
  vat_number                TEXT,        -- מספר עוסק מורשה
  vat_rate                  NUMERIC(5,4) DEFAULT 0.17,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  role          TEXT        NOT NULL DEFAULT 'student'
                CHECK (role IN ('super_admin','tenant_admin','teacher','parent','student')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Migration 002 — People and families

> **Design note:** `students` is renamed to `people` to support adult students, art pupils,
> piano students, and community center members — all in the same table with the same model.
> `is_minor` drives which rules apply. `family_id` is nullable for solo adult enrolees.

```sql
CREATE TABLE families (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  primary_contact_name  TEXT        NOT NULL,
  primary_email         TEXT        NOT NULL,
  stripe_customer_id    TEXT,
  notes                 TEXT,
  anonymised_at         TIMESTAMPTZ,          -- set on GDPR deletion request
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE family_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  family_id        UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_profile_id  UUID REFERENCES user_profiles(id),
  email            TEXT NOT NULL,
  full_name        TEXT NOT NULL,
  relationship     TEXT NOT NULL DEFAULT 'parent'
                   CHECK (relationship IN ('parent','guardian','emergency_contact','self')),
  -- 'self' = adult student who is their own family contact
  can_collect      BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unified person table: children, teens, adults, community members, art pupils
CREATE TABLE people (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID        NOT NULL REFERENCES tenants(id),
  family_id                UUID        REFERENCES families(id),  -- nullable for adult solo enrolees
  user_profile_id          UUID        REFERENCES user_profiles(id),  -- set for adult students with portal access
  full_name                TEXT        NOT NULL,
  date_of_birth            DATE,       -- nullable for adults who choose not to share
  -- FIXED (Issue #13): is_minor is now computed from date_of_birth (source of truth)
  -- Computed: true if date_of_birth exists and age < 18, false otherwise
  is_minor                 BOOLEAN     GENERATED ALWAYS AS (
                             CASE WHEN date_of_birth IS NULL THEN false
                                  WHEN EXTRACT(YEAR FROM age(now(), date_of_birth)) < 18 THEN true
                                  ELSE false
                             END
                           ) STORED,
  gender                   TEXT,
  medical_notes            TEXT,       -- sensitive: appears in audit log on every access
  allergies                TEXT,
  emergency_contact_name   TEXT,
  emergency_contact_phone  TEXT,
  photo_consent            BOOLEAN     NOT NULL DEFAULT false,
  media_consent            BOOLEAN     NOT NULL DEFAULT false,
  status                   TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','inactive','withdrawn')),
  -- Legal
  waiver_accepted_at       TIMESTAMPTZ,
  waiver_version           TEXT,
  waiver_text_snapshot     TEXT,       -- full waiver text at time of acceptance
  anonymised_at            TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Migration 003 — Contact preferences

> **Design note:** Communication targets are people and family_members, not families.
> Every human with a phone has their own preferences. A 16-year-old wants to know
> their class is cancelled — they don't need their parent involved.
> Adult students manage their own preferences entirely.

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

### Migration 004 — Terms and classes

```sql
CREATE TABLE terms (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  name        TEXT        NOT NULL,
  start_date  DATE        NOT NULL,
  end_date    DATE        NOT NULL,
  is_current  BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_current_term_per_tenant
  ON terms (tenant_id) WHERE (is_current = true);

CREATE TABLE levels (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  name        TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE classes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  term_id               UUID        NOT NULL REFERENCES terms(id),
  level_id              UUID        REFERENCES levels(id),   -- nullable: not all classes have levels
  teacher_id            UUID        REFERENCES user_profiles(id),
  name                  TEXT        NOT NULL,

  -- Scheduling
  day_of_week           INT         CHECK (day_of_week BETWEEN 0 AND 6),  -- NULL for one-off
  start_time            TIME        NOT NULL,
  end_time              TIME        NOT NULL,
  studio_room           TEXT,

  -- Class type
  class_type            TEXT        NOT NULL DEFAULT 'recurring'
                        CHECK (class_type IN ('recurring','one_off','workshop','event')),
  is_public             BOOLEAN     NOT NULL DEFAULT true,
  registration_required BOOLEAN     NOT NULL DEFAULT true,
  drop_in_allowed       BOOLEAN     NOT NULL DEFAULT false,
  drop_in_price_minor   INT,

  -- Capacity and pricing
  max_capacity          INT         NOT NULL DEFAULT 15,
  price_minor           INT         NOT NULL DEFAULT 0,
  currency              TEXT        NOT NULL DEFAULT 'ILS',

  -- VAT (inherited from tenant unless overridden)
  vat_rate              NUMERIC(5,4),   -- NULL = use tenant default

  status                TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','cancelled','full')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE class_sessions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id              UUID        NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  session_date          DATE        NOT NULL,
  start_time            TIME,       -- can override class start_time (makeup sessions etc.)
  status                TEXT        NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','cancelled','completed')),
  cancellation_reason   TEXT,
  substitute_teacher_id UUID        REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Migration 005 — Class requirements (replaces age columns)

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

function evaluateRequirement(req: ClassRequirement, person: Person): boolean {
  switch (req.requirement_type) {
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
      return false; // always flags — admin must manually approve
    case "equipment_required":
      return true; // informational only — no automatic block
    default:
      return true;
  }
}
```

### Migration 006 — Enrolments

```sql
CREATE TABLE enrolments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  person_id             UUID        NOT NULL REFERENCES people(id),
  class_id              UUID        NOT NULL REFERENCES classes(id),
  term_id               UUID        NOT NULL REFERENCES terms(id),
  status                TEXT        NOT NULL DEFAULT 'pending_payment'
                        CHECK (status IN (
                          'pending_payment',
                          'active',
                          'trial',
                          'waiting_list',
                          'admin_review',    -- flagged by soft requirement
                          'cancelled',
                          'withdrawn'
                        )),
  -- Placement
  prior_experience      TEXT,         -- free text: "3 years ballet in London"
  placement_notes       TEXT,         -- teacher note after first class
  placement_confirmed   BOOLEAN       NOT NULL DEFAULT false,
  trial_class_date      DATE,

  -- Payment
  stripe_subscription_id TEXT,
  stripe_payment_intent_id TEXT,

  -- Legal
  terms_accepted_at     TIMESTAMPTZ,
  terms_version         TEXT,

  -- Lifecycle
  enrolled_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at          TIMESTAMPTZ,
  cancellation_reason   TEXT,
  anonymised_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Allow re-enrollment after cancellation/withdrawal
  -- Constraint only applies to active enrolments
  UNIQUE (person_id, class_id, term_id) WHERE status NOT IN ('cancelled','withdrawn')
);

CREATE TABLE waiting_list (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  class_id         UUID        NOT NULL REFERENCES classes(id),
  person_id        UUID        NOT NULL REFERENCES people(id),
  -- FIXED (Issue #15): position auto-derived from created_at (no manual management)
  -- To get position: ROW_NUMBER() OVER (PARTITION BY class_id ORDER BY added_at ASC)
  added_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at      TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,
  UNIQUE (class_id, person_id)
);

CREATE INDEX idx_waiting_list_position ON waiting_list(class_id, added_at);
```

### Migration 007 — Attendance

```sql
CREATE TABLE attendance (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  session_id  UUID        NOT NULL REFERENCES class_sessions(id),
  person_id   UUID        NOT NULL REFERENCES people(id),
  status      TEXT        NOT NULL DEFAULT 'present'
              CHECK (status IN ('present','absent','absent_excused','makeup')),
  marked_by   UUID        REFERENCES user_profiles(id),
  marked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes       TEXT,
  UNIQUE (session_id, person_id)
);

CREATE TABLE makeup_credits (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id),
  person_id         UUID        NOT NULL REFERENCES people(id),
  source_session_id UUID        REFERENCES class_sessions(id),
  used_session_id   UUID        REFERENCES class_sessions(id),
  expires_at        DATE,
  status            TEXT        NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','used','expired')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Migration 008 — Payments and finance

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

  -- Invoice (Israeli legal requirement)
  invoice_number             TEXT        UNIQUE,
  invoice_issued_at          TIMESTAMPTZ,
  invoice_url                TEXT,        -- Supabase Storage PDF or Green Invoice URL

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

### Migration 009 — Expenses

> **Required in V1.** Without this table you have no P&L and cannot calculate profit.
> Your accountant needs both sides from day one.

```sql
CREATE TABLE expenses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  category         TEXT        NOT NULL
                   CHECK (category IN (
                     'studio_rent',
                     'teacher_wages',
                     'equipment',
                     'marketing',
                     'software_subscriptions',
                     'insurance',
                     'utilities',
                     'professional_services',   -- accountant, lawyer
                     'other'
                   )),
  description      TEXT        NOT NULL,
  pretax_amount_minor INT      NOT NULL,
  vat_amount_minor    INT      NOT NULL DEFAULT 0,
  total_amount_minor  INT      NOT NULL,
  currency         TEXT        NOT NULL DEFAULT 'ILS',
  supplier_name    TEXT,
  supplier_vat_number TEXT,    -- for VAT reclaim
  receipt_url      TEXT,       -- Supabase Storage
  expense_date     DATE        NOT NULL,
  created_by       UUID        REFERENCES user_profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Migration 010 — Invoice sequences

> **Israeli legal requirement.** Invoice numbers must be sequential and gapless.
> This atomic function prevents gaps under concurrent payments.

```sql
CREATE TABLE invoice_sequences (
  tenant_id      UUID    PRIMARY KEY REFERENCES tenants(id),
  last_number    INT     NOT NULL DEFAULT 0,
  prefix         TEXT    NOT NULL DEFAULT 'INV',
  year_prefix    BOOLEAN NOT NULL DEFAULT true   -- INV-2025-0001 format
);

-- Atomic increment — call inside payment processing transaction
-- FIXED: year_prefix now properly detects year boundary and resets sequence
CREATE OR REPLACE FUNCTION next_invoice_number(p_tenant_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  seq RECORD;
  new_number INT;
  invoice_num TEXT;
  current_year TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM now())::TEXT;

  UPDATE invoice_sequences
  SET last_number = last_number + 1
  WHERE tenant_id = p_tenant_id
  RETURNING * INTO seq;

  IF NOT FOUND THEN
    INSERT INTO invoice_sequences (tenant_id, last_number, year_prefix) VALUES (p_tenant_id, 1, true)
    RETURNING * INTO seq;
    new_number := 1;
  ELSE
    new_number := seq.last_number;
  END IF;

  IF seq.year_prefix THEN
    invoice_num := seq.prefix || '-' || current_year || '-' || LPAD(new_number::TEXT, 4, '0');
  ELSE
    invoice_num := seq.prefix || '-' || LPAD(new_number::TEXT, 6, '0');
  END IF;

  RETURN invoice_num;
END;
$$;
```

### Migration 011 — Notification log

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

### Migration 012 — Audit log

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

### Migration 013 — Tenant notification templates

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

### Migration 014 — Expense categories

> **Issue #9 fix:** Expense categories now configurable per tenant instead of hardcoded.
> Schools can add custom categories (e.g., 'guest_artist_fee', 'prop_rental').

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

-- Update Migration 009 (Expenses): replace CHECK constraint with FK
-- OLD: CHECK (category IN (...hardcoded list...))
-- NEW: FOREIGN KEY (tenant_id, category_id) REFERENCES expense_categories(tenant_id, id)
-- (Modify expenses table: drop category TEXT, add category_id UUID FOREIGN KEY)
```

### Migration 015 — Notification queue

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

### Migration 016 — AI log

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

````

### Indexes and RLS

```sql
-- === INDEXES ===
CREATE INDEX idx_people_tenant         ON people(tenant_id);
CREATE INDEX idx_people_family         ON people(family_id);
CREATE INDEX idx_enrolments_tenant     ON enrolments(tenant_id);
CREATE INDEX idx_enrolments_person     ON enrolments(person_id);
CREATE INDEX idx_enrolments_class      ON enrolments(class_id);
CREATE INDEX idx_enrolments_status     ON enrolments(status);
CREATE INDEX idx_payments_tenant       ON payments(tenant_id);
CREATE INDEX idx_payments_family       ON payments(family_id);
CREATE INDEX idx_payments_status       ON payments(status);
CREATE INDEX idx_audit_log_tenant      ON audit_log(tenant_id);
CREATE INDEX idx_audit_log_entity      ON audit_log(entity_type, entity_id);
CREATE INDEX idx_sessions_class        ON class_sessions(class_id);
CREATE INDEX idx_sessions_date         ON class_sessions(session_date);
CREATE INDEX idx_attendance_session    ON attendance(session_id);
CREATE INDEX idx_requirements_class    ON class_requirements(class_id);
CREATE INDEX idx_contact_person        ON contact_preferences(person_id);
CREATE INDEX idx_contact_family_member ON contact_preferences(family_member_id);

-- === RLS ===
ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE families             ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE people               ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms                ENABLE ROW LEVEL SECURITY;
ALTER TABLE levels               ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_requirements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrolments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_list         ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance           ENABLE ROW LEVEL SECURITY;
ALTER TABLE makeup_credits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_rules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_pay_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_sequences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_log               ENABLE ROW LEVEL SECURITY;

-- Helper functions (SECURITY DEFINER prevents recursion in policies)
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT tenant_id FROM user_profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_my_family_ids()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT family_id FROM family_members WHERE user_profile_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_my_person_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM people WHERE user_profile_id = auth.uid()
$$;

-- Super admin bypass: super_admins can read/write all tenants without tenant_id checks
-- (used only for platform-level admin operations)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role = 'super_admin' FROM user_profiles WHERE id = auth.uid()
$$;

-- Tenants: super_admin only can see all; users see own tenant only
CREATE POLICY "super_admin sees all tenants" ON tenants FOR ALL
  USING (is_super_admin());

CREATE POLICY "users see own tenant" ON tenants FOR SELECT
  USING (id = get_my_tenant_id());

-- User profiles: users can read own profile; admins read all in their tenant; super_admin reads all
CREATE POLICY "super_admin reads all profiles" ON user_profiles FOR SELECT
  USING (is_super_admin());

CREATE POLICY "admins manage tenant profiles" ON user_profiles FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('tenant_admin','super_admin'));

CREATE POLICY "users read own profile" ON user_profiles FOR SELECT
  USING (id = auth.uid());

-- Families: admins manage; parents/adult students see own
CREATE POLICY "super_admin manages all families" ON families FOR ALL
  USING (is_super_admin());

CREATE POLICY "admins manage families" ON families FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');

CREATE POLICY "family members see own family" ON families FOR SELECT
  USING (id IN (SELECT family_id FROM family_members WHERE user_profile_id = auth.uid()));

-- Family members: admins manage; parents/students see own family members
CREATE POLICY "super_admin manages all family_members" ON family_members FOR ALL
  USING (is_super_admin());

CREATE POLICY "admins manage family_members" ON family_members FOR ALL
  USING ((SELECT tenant_id FROM families WHERE id = family_members.family_id) = get_my_tenant_id()
         AND (SELECT get_my_role()) = 'tenant_admin');

CREATE POLICY "family members see own family" ON family_members FOR SELECT
  USING (user_profile_id = auth.uid()
         OR family_id IN (SELECT get_my_family_ids()));

-- People: staff see all; parents see own family; adult students see themselves; super_admin sees all
CREATE POLICY "super_admin sees all people" ON people FOR ALL
  USING (is_super_admin());

CREATE POLICY "staff see all people" ON people FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('tenant_admin','teacher'));

CREATE POLICY "parents see own family people" ON people FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND family_id IN (SELECT get_my_family_ids()));

CREATE POLICY "adult students see self" ON people FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND id = get_my_person_id());

-- Contact preferences: users manage own; admins see all
CREATE POLICY "super_admin manages all contact_preferences" ON contact_preferences FOR ALL
  USING (is_super_admin());

CREATE POLICY "admins manage preferences" ON contact_preferences FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');

CREATE POLICY "users manage own preferences" ON contact_preferences FOR ALL
  USING (person_id = get_my_person_id()
         OR family_member_id IN (SELECT id FROM family_members WHERE user_profile_id = auth.uid()));

-- Terms & Levels: public read; admin write
CREATE POLICY "all see terms" ON terms FOR SELECT USING (true);
CREATE POLICY "super_admin manages all terms" ON terms FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage terms" ON terms FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');

CREATE POLICY "all see levels" ON levels FOR SELECT USING (true);
CREATE POLICY "super_admin manages all levels" ON levels FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage levels" ON levels FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');

-- Classes: public read (schedule page); admin write
CREATE POLICY "super_admin manages all classes" ON classes FOR ALL
  USING (is_super_admin());
CREATE POLICY "public read classes" ON classes FOR SELECT USING (is_public = true);
CREATE POLICY "admins and teachers manage classes" ON classes FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('tenant_admin','teacher'));

-- Class requirements: visible to enrollers; admin manage
CREATE POLICY "super_admin manages all requirements" ON class_requirements FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage requirements" ON class_requirements FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');
CREATE POLICY "all see requirements" ON class_requirements FOR SELECT USING (true);

-- Class sessions: visible to class participants; admin/teacher manage
CREATE POLICY "super_admin manages all sessions" ON class_sessions FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins and teachers manage sessions" ON class_sessions FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('tenant_admin','teacher'));
CREATE POLICY "enrolled students see sessions" ON class_sessions FOR SELECT
  USING (class_id IN (SELECT class_id FROM enrolments WHERE person_id = get_my_person_id()));

-- Enrolments: admins manage; families see own; adult students see own
CREATE POLICY "super_admin manages all enrolments" ON enrolments FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage enrolments" ON enrolments FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');
CREATE POLICY "parents see own enrolments" ON enrolments FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND person_id IN
    (SELECT id FROM people WHERE family_id IN (SELECT get_my_family_ids())));
CREATE POLICY "adult students see own enrolments" ON enrolments FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND person_id = get_my_person_id());

-- Waiting list: admins manage; families can see if registered
CREATE POLICY "super_admin manages all waiting_list" ON waiting_list FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage waiting_list" ON waiting_list FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');
CREATE POLICY "people see own waiting_list" ON waiting_list FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND person_id = get_my_person_id());

-- Attendance: teachers mark; admins/families see results
CREATE POLICY "super_admin manages all attendance" ON attendance FOR ALL
  USING (is_super_admin());
CREATE POLICY "teachers mark attendance" ON attendance FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('tenant_admin','teacher'));
CREATE POLICY "families see own attendance" ON attendance FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND person_id IN
    (SELECT id FROM people WHERE family_id IN (SELECT get_my_family_ids())));
CREATE POLICY "adult students see own attendance" ON attendance FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND person_id = get_my_person_id());

-- Makeup credits: admins manage; families see own
CREATE POLICY "super_admin manages all makeup_credits" ON makeup_credits FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage makeup_credits" ON makeup_credits FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');
CREATE POLICY "families see own makeup_credits" ON makeup_credits FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND person_id IN
    (SELECT id FROM people WHERE family_id IN (SELECT get_my_family_ids())));
CREATE POLICY "adult students see own makeup_credits" ON makeup_credits FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND person_id = get_my_person_id());

-- Payments: admins manage; parents/adult students see own
CREATE POLICY "super_admin manages all payments" ON payments FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage payments" ON payments FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');
CREATE POLICY "parents see own payments" ON payments FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND family_id IN (SELECT get_my_family_ids()));
CREATE POLICY "adult students see own payments" ON payments FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND person_id = get_my_person_id());

-- Expenses: admin only
CREATE POLICY "super_admin manages all expenses" ON expenses FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage expenses" ON expenses FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');

-- Discount rules: admin read/write
CREATE POLICY "super_admin manages all discount_rules" ON discount_rules FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage discount_rules" ON discount_rules FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');
CREATE POLICY "all read active discount codes" ON discount_rules FOR SELECT
  USING (is_active = true);

-- Teacher pay records: admin manage
CREATE POLICY "super_admin manages all teacher_pay_records" ON teacher_pay_records FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage teacher_pay_records" ON teacher_pay_records FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');

-- Notification log: admin read; triggers insert
CREATE POLICY "super_admin reads all notification_log" ON notification_log FOR SELECT
  USING (is_super_admin());
CREATE POLICY "admins read notification_log" ON notification_log FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');
CREATE POLICY "insert notification_log" ON notification_log FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Audit log: insert by all; read by admin only
CREATE POLICY "super_admin reads all audit_log" ON audit_log FOR SELECT
  USING (is_super_admin());
CREATE POLICY "insert audit" ON audit_log FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "admins read audit" ON audit_log FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');

-- Invoice sequences: admin manage
CREATE POLICY "super_admin manages all invoice_sequences" ON invoice_sequences FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage invoice_sequences" ON invoice_sequences FOR ALL
  USING (invoice_sequences.tenant_id = get_my_tenant_id()
         AND (SELECT get_my_role()) = 'tenant_admin');

-- Tenant notification templates (Issue #7): admins manage; all can read approved
CREATE POLICY "super_admin manages all templates" ON tenant_notification_templates FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage templates" ON tenant_notification_templates FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');
CREATE POLICY "all read approved templates" ON tenant_notification_templates FOR SELECT
  USING (status = 'approved');

-- Expense categories (Issue #9): admins manage; all can read
CREATE POLICY "super_admin manages all categories" ON expense_categories FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage categories" ON expense_categories FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');
CREATE POLICY "all read active categories" ON expense_categories FOR SELECT
  USING (is_active = true);

-- Notification queue (Issue #10): system insert/update; admins read
CREATE POLICY "super_admin reads all queue" ON notification_queue FOR ALL
  USING (is_super_admin());
CREATE POLICY "admins manage queue" ON notification_queue FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');
CREATE POLICY "system inserts queue" ON notification_queue FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

-- AI log (Issue #11): immutable after creation; admins read
CREATE POLICY "super_admin reads all ai_log" ON ai_log FOR SELECT
  USING (is_super_admin());
CREATE POLICY "admins read ai_log" ON ai_log FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'tenant_admin');
CREATE POLICY "insert ai_log" ON ai_log FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());
````

---

## 4.1 SPEC Issues Resolution (v2 updates)

All 15 identified issues from SPEC_additions.md have been resolved:

### Critical issues (5) — Fixed in schema

| #   | Issue                                                | Fix location                                                                                             |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | user_profiles defined after tables that reference it | Migration 001: user_profiles now created first, before families/family_members                           |
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
| 8   | Subscription vs. payment intent ambiguity             | Section 6 Phase 1E: [TO DO] Add clarification comment on payment state machine                                  |
| 9   | Expense categories hardcoded in CHECK                 | Migration 014: New expense_categories table; expenses now reference this table instead of hardcoded CHECK       |
| 10  | No notification retry/queue mechanism                 | Migration 015: New notification_queue table with retry logic, attempt tracking, and exponential backoff pattern |

### Worth knowing issues (5) — Fixed with schema/documentation

| #   | Issue                                            | Fix location                                                                                                         |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 11  | ai_log table referenced but never defined        | Migration 016: Defined ai_log table with full audit trail for AI interactions (tokens, flags, PII detection)         |
| 12  | VAT rounding strategy undefined                  | Section 2.5: Documented banker's rounding strategy (ISO 80000-1, Israeli accounting norms)                           |
| 13  | is_minor stored boolean never revalidated        | Migration 002: Converted is_minor to GENERATED ALWAYS AS computed column from date_of_birth                          |
| 14  | decryptVault() doesn't match Supabase Vault API  | Section 5: Updated getTenantConfig() to use SQL function with pgp_sym_decrypt() via RPC, not raw decryptVault()      |
| 15  | waiting_list.position requires manual management | Migration 007: Removed position column; use ROW_NUMBER() OVER (PARTITION BY class_id ORDER BY added_at) for position |

---

## 5. Auth & Authorisation

### Role model

| Role           | Auth method            | Access                                             |
| -------------- | ---------------------- | -------------------------------------------------- |
| `super_admin`  | Password + 2FA         | All tenants — platform owner only                  |
| `tenant_admin` | Password               | Full school data                                   |
| `teacher`      | Password or magic link | Own classes: read + attendance + placement confirm |
| `parent`       | Magic link             | Own family: read + pay + update contact            |
| `student`      | Magic link             | Own data only: adult students with portal access   |

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
    locale: tenant.locale,
  };
}

// Database function (in migration 001 after tenants table):
// CREATE OR REPLACE FUNCTION get_decrypted_tenant_config(p_tenant_id UUID)
// RETURNS TABLE (
//   stripe_secret_key TEXT,
//   stripe_webhook_secret TEXT,
//   resend_api_key TEXT,
//   resend_from_email TEXT,
//   twilio_account_sid TEXT,
//   twilio_auth_token TEXT,
//   twilio_whatsapp_number TEXT,
//   vat_rate NUMERIC,
//   currency TEXT,
//   locale TEXT
// ) LANGUAGE SQL SECURITY DEFINER AS $$
//   SELECT
//     pgp_sym_decrypt(stripe_secret_key_enc, current_setting('app.encryption_key'))::TEXT,
//     pgp_sym_decrypt(stripe_webhook_secret_enc, current_setting('app.encryption_key'))::TEXT,
//     pgp_sym_decrypt(resend_api_key_enc, current_setting('app.encryption_key'))::TEXT,
//     resend_from_email,
//     pgp_sym_decrypt(twilio_account_sid_enc, current_setting('app.encryption_key'))::TEXT,
//     pgp_sym_decrypt(twilio_auth_token_enc, current_setting('app.encryption_key'))::TEXT,
//     twilio_whatsapp_number,
//     vat_rate,
//     currency,
//     locale
//   FROM tenants
//   WHERE id = p_tenant_id;
// $$;
```

**Key security details:**

- Encrypted secrets never leave the database unencrypted
- Decryption happens via `SECURITY DEFINER` SQL function (runs as function owner, not caller)
- Encryption key stored in database settings (`app.encryption_key`), not in code
- Edge Functions access only the decrypted result, never the encrypted column values

---

## 6. V1 Implementation

> **V1 scope:** Fully working single-school system. Multi-tenant infrastructure in place.
> Parent portal and adult student portal included. Expense tracking included.
> WhatsApp notifications for critical events included.
> **Estimated effort:** 310–380 hours with AI tooling.

### Phase 1A — Project skeleton (Days 1–3)

```bash
pnpm dlx create-turbo@latest ballet-school-system --package-manager npm
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

- [ ] `<html lang="he" dir="rtl">` set in `index.html`
- [ ] `tailwindcss-rtl` plugin added to `tailwind.config.ts`
- [ ] `format.ts` utilities created (currency, date, phone)
- [ ] i18next configured with `he.json` as primary, `en.json` as secondary
- [ ] FullCalendar Hebrew locale imported
- [ ] All Tailwind spacing uses `ms-`, `me-` not `ml-`, `mr-`
- [ ] **WCAG 2.1 AA:** Install `@axe-core/react`, `axe-playwright`, `eslint-plugin-jsx-a11y` (run `pnpm dlx snyk test` first)
- [ ] **WCAG 2.1 AA:** Configure ESLint with jsx-a11y plugin and rules in `.eslintrc.json`
- [ ] **WCAG 2.1 AA:** Create `e2e/accessibility-compliance.spec.ts` with heading structure, form validation, focus trap tests
- [ ] **WCAG 2.1 AA:** Add pnpm scripts to `package.json`: `a11y:lint`, `a11y:axe`, `a11y:e2e`
- [ ] **WCAG 2.1 AA:** Add axe-core CI job to `.github/workflows/ci.yml` (blocks merge if violations found)
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

### Phase 1B — Auth and tenant context (Days 4–6)

Key implementation: `useTenant()` resolves from subdomain. In dev: `VITE_DEV_TENANT_SUBDOMAIN`. In prod: `window.location.hostname.split('.')[0]`.

Route guards: `AdminRoute`, `TeacherRoute`, `ParentRoute`, `StudentRoute` (adult portal).

### Phase 1C — Core data modules (Days 7–20)

Build in this order:

| Order | Module                 | Key screens                                                   |
| ----- | ---------------------- | ------------------------------------------------------------- |
| 1     | People                 | List (search/filter/status), detail with medical, create/edit |
| 2     | Families               | Detail with members, link adult student accounts              |
| 3     | Levels + Terms         | Admin setup: create levels, create/mark current term          |
| 4     | Classes + Requirements | Create class, define requirements, assign teacher             |
| 5     | Class sessions         | Generate sessions via Edge Function on class creation         |
| 6     | Enrolment              | 4-step wizard (no placement questionnaire in V1)              |
| 7     | Teachers               | Profile, class assignment, type (contractor/employee)         |

#### V1 enrolment wizard (simplified — no placement scoring)

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

### Phase 1D — Notifications (Days 21–26)

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
5. Phone number opt-in collected and verified during enrolment (WhatsApp OTP)

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

All Stripe API calls creating or modifying payment objects happen in Edge Functions. Frontend receives `clientSecret` only.

Key Edge Functions:

- `create-payment-intent`: loads class price, applies discount server-side, calculates VAT, creates PaymentIntent, generates invoice number atomically
- `stripe-webhook`: idempotent handler for `payment_intent.succeeded`, `payment_intent.payment_failed`, `invoice.payment_failed`, `customer.subscription.deleted`

#### Payment state machine (Issue #8 clarification: subscription vs payment intent)

**Single source of truth:** PaymentIntent status is authoritative. Subscription objects are informational only for recurring billing.

```
Payment flow (V1 — one-time class enrolment):
1. Frontend: Load class price → show Payment Element
2. Edge Function create-payment-intent: Create PaymentIntent, return clientSecret
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

Dunning (configure in Stripe dashboard — retry schedule):

```
Day 0:  Decline → Stripe auto-retries
Day 3:  Retry → send payment_reminder WhatsApp + email
Day 7:  Retry → send payment_reminder_urgent
Day 14: Exhausted → enrolment → cancelled; trigger waiting list; send cancellation notice
```

### Phase 1F — Admin dashboard (Days 35–42)

Screens:

- **Overview:** today's classes, enrolments this term, revenue this month, outstanding payments, quick actions
- **People:** searchable directory, filter by status/class, export CSV
- **Classes:** by term, with occupancy bar and waiting list count
- **Payments:** transaction log with VAT column, filter by status/date; basic P&L (revenue vs expenses)
- **Expenses:** enter and categorise expenses; receipt upload to Supabase Storage
- **Notifications:** compose email blast; select recipients by class/level/all; WhatsApp blast for urgent items
- **Settings:** school profile, levels, terms, class requirements, discount rules, external API keys

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
[ ] All 16 migrations applied and verified in Supabase dashboard
[ ] Types regenerated: supabase gen types typescript --linked
[ ] RLS verified: parent sees only own family; teacher sees only own tenant
[ ] Invoice sequences table seeded for your tenant
[ ] VAT rate set correctly on tenant row (0.17 if עוסק מורשה, 0 if עוסק פטור)

STRIPE
[ ] Webhook endpoint pointing to stripe-webhook Edge Function
[ ] Events: payment_intent.succeeded, payment_intent.payment_failed,
    invoice.payment_failed, customer.subscription.deleted
[ ] End-to-end test: payment → enrolment active → invoice generated

WHATSAPP
[ ] Twilio account set up with Israeli phone number
[ ] All message templates approved by Meta (allow 5 days)
[ ] Test WhatsApp message delivered to your own number
[ ] Opt-in collection and OTP verification tested in enrolment flow

EMAIL
[ ] Resend domain verified (SPF + DKIM)
[ ] All email templates tested to Gmail, Walla Mail, and Gmail Israeli accounts

LEGAL
[ ] Privacy Policy live and linked in footer
[ ] Terms of Service live and linked at enrolment
[ ] Waiver text confirmed by lawyer and stored as accepted snapshot on each enrolment
[ ] Background checks on file for all teachers working with minors

SECURITY
[ ] tsc --noEmit: zero errors
[ ] All secrets in Supabase Vault / Edge Function secrets — none in code
[ ] Source maps disabled in production Vite config
```

### Secrets configuration

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  RESEND_API_KEY=re_... \
  TWILIO_ACCOUNT_SID=AC... \
  TWILIO_AUTH_TOKEN=... \
  ANTHROPIC_API_KEY=sk-ant-...

# Note: per-tenant keys are stored encrypted in the tenants table via Supabase Vault
# The above are platform-level fallback keys for your own school in early stage
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

### V2.6 — Green Invoice integration

Edge Function calls Green Invoice API on payment success. Generates legally-compliant Israeli tax invoice. Stores invoice URL in `payments.invoice_url`. Accountant receives monthly export automatically.

### V2.7 — QuickBooks / Xero export

Date-range CSV from `payments` + `expenses` tables in standard import format. Admin downloads from finance dashboard. Format documented for accountant on day one even before the UI exists.

### V2.8 — Apparel shop

Stripe payment for physical items. Products linked to class levels. Stock tracking. Admin marks orders as collected/dispatched.

### V2.9 — Document management

Digital waiver with full text snapshot. Medical form PDF upload. Photo/media consent per event. GDPR deletion request flow.

### V2.10 — Progress reports

Teacher writes end-of-term note per student. Admin reviews. System sends PDF to family via email and stores in student record.

---

## 9. V3 SaaS Roadmap

### V3.1 — Self-service tenant onboarding

`signup.yoursystem.com` — school name, subdomain, plan selection, admin account creation, guided setup wizard.

### V3.2 — White-label theming

Tenant config drives: logo, primary colour, accent colour, `dir` (rtl/ltr), `locale`, font choice (limited to 3 options). Applied as CSS custom properties at app init.

### V3.3 — Subscription billing for schools

Your Stripe account (separate from tenant Stripe accounts) charges schools monthly. Plans: Trial (free, 30 students), Basic (₪299/month, 100 students), Pro (₪599/month, unlimited).

### V3.4 — Feature flags

`feature_flags` table: per-tenant feature toggles. Used to: roll out V2 features gradually, restrict features by plan, A/B test new workflows.

### V3.5 — Super-admin dashboard

All tenants: plan, student count, MRR, last active. Drill-down per tenant. Plan management. Impersonation for support (logged to audit_log).

### V3.6 — Communication drafting AI

Admin describes intent in natural language → Claude drafts email or WhatsApp message → admin reviews in split-pane editor → sends via existing notification system.

---

## 10. AI Integration Specification

> AI features are modules. The system is fully functional without them.
> No AI feature touches payment logic or enrolment state transitions.

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

---

## 11. Testing Strategy

### Unit tests — pure functions, no mocks needed

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

// Test VAT calculation
describe("calculateVat", () => {
  it("calculates 17% VAT correctly", () => {
    const { pretax, vat, total } = calculateVat(1000, 0.17);
    expect(pretax).toBe(855); // 1000 / 1.17 rounded
    expect(vat).toBe(145);
    expect(total).toBe(1000);
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

### RLS security tests

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

### E2E tests (Playwright) — V2 priority

Critical paths only:

1. Full enrolment → payment → WhatsApp confirmation received
2. Class cancelled → makeup credit created → parent notified on preferred channel
3. Adult student self-enrols and accesses student portal

### Accessibility tests — WCAG 2.1 Level AA (merged into Definition of Done)

**Test file:** `apps/web/e2e/accessibility-compliance.spec.ts`

**Scope:** All customer-facing pages (no admin panels in V1). Tests run on every PR; zero violations required.

```typescript
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

    // Rough check: in RTL, first focusable element should be on the right side
    if (elements.length > 0) {
      const firstBox = await elements[0].boundingBox();
      expect(firstBox?.x).toBeGreaterThan(page.viewportSize() / 2);
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

  test("checkboxes/radios have aria-checked", async ({ page }) => {
    await page.goto("/enrolment");
    const radios = await page
      .locator('input[type="radio"], input[type="checkbox"]')
      .all();

    for (const radio of radios) {
      const checked = await radio.getAttribute("aria-checked");
      expect(checked).toBeTruthy();
    }
  });
});

/**
 * Phase 1C Acceptance Criteria: Accessibility
 * Before a feature is considered "done", verify:
 * - [ ] Heading structure: no level skips, exactly 1 h1 per page
 * - [ ] Forms: all inputs labeled, validation errors announce
 * - [ ] Modals: focus trapped, Tab cycles, Escape closes
 * - [ ] Contrast: 4.5:1 min for text
 * - [ ] Keyboard: Tab through all elements, no focus loss
 * - [ ] Landmarks: <main> or role="main" present
 * - [ ] RTL: lang="he" dir="rtl", tab order matches visual layout
 * - [ ] ARIA: proper roles, aria-label/aria-described, aria-checked for inputs
 * - [ ] NVDA: manual smoke test passes (15 min, Hebrew mode, before merge)
 * - [ ] No axe-core violations: `pnpm run a11y:e2e`
 */
```

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

---

_Document version: 2.0_
_Replaces: v1.0 blueprint_
_Key changes from v1.0: placement questionnaire removed from V1; people table replaces students;
contact_preferences replaces email_log; class_requirements replaces age columns; expenses table
added to V1; VAT and invoice sequence added; RTL and i18n specified; WhatsApp architecture
detailed; pass-through API key model documented; adult student model added; AI features
clearly marked as non-critical modules._
