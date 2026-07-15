/**
 * Feature Flag Registry for OpalSwift Multi-Tenant SaaS
 *
 * This registry defines all available feature flags as string literals,
 * organized by domain. Each feature maps to a specific roadmap item.
 *
 * Convention: domain:resource.action
 * Storage: Join table model — see core-architecture-decision.md section 4 for full schema.
 *          Artifact 5 Batch 5 implements this.
 *
 * Tiers: Essential — appointment-based freelancers (photographers, beauticians)
 *        Professional — class-based businesses with family billing (dance studios)
 *        Pricing amounts are admin-configurable data in the plans/pricing table — never hardcoded.
 *
 * ARTIFACT 1 of 5 — generated 2026-06-25 via OpenRouter / claude-sonnet-4
 *                   revised 2026-06-25 — renamed Essential/Professional, audit fixes applied
 *                   revised 2026-06-26 — join table schema, vertical presets, feature dependencies
 *                   revised 2026-07-05 — stack correction (Vite/React, not Next.js)
 *                   revised 2026-07-07 — removed stale gig/roster terminology from comments
 *
 * TARGET FILE IN REPO: packages/shared/src/config/feature-registry.ts
 * Sits alongside packages/shared/src/config/tenant-presets.ts — do NOT replace tenant-presets.ts.
 * Export from packages/shared/src/index.ts alongside existing exports.
 *
 * RUNTIME GATING PATTERNS — this stack has TWO gate locations:
 *   1. React web app (Vite SPA):
 *      apps/web/src/hooks/useFeatureGate.ts — React hook that calls
 *      get_tenant_features() RPC and returns { hasFeature(key), isLoading }.
 *      Used in components and route guards (React Router ProtectedRoute wrapper).
 *
 *   2. Supabase Edge Functions (Deno runtime):
 *      supabase/functions/_shared/feature-gate.ts — Deno helper that takes a
 *      Supabase client + tenantId, fetches features, calls requireFeature().
 *
 *   There is NO Next.js, NO Server Actions, NO middleware.ts in this codebase.
 */
export declare const FEATURES: {
    readonly platform: {
        /** Multi-tenant architecture with tenant isolation */
        readonly multiTenant: "platform:tenant.isolation";
        /** User authentication and authorization */
        readonly auth: "platform:auth.enabled";
        /** Internationalization support (Hebrew/English) */
        readonly i18n: "platform:i18n.enabled";
        /** Tenant-level configuration management */
        readonly settings: "platform:settings.manage";
        /** 14-day trial period for new tenants */
        readonly trial: "platform:trial.enabled";
        /** Self-service tenant registration */
        readonly selfSignup: "platform:signup.selfServe";
        /** Super-admin dashboard access */
        readonly superAdmin: "platform:admin.super";
        /** Custom domain support */
        readonly customDomains: "platform:domains.custom";
        /** Visual theme customization */
        readonly themeCustomizer: "platform:themes.customize";
    };
    readonly people: {
        /** CRUD operations for people/contacts */
        readonly crud: "people:contacts.manage";
        /** Family and account relationship management */
        readonly families: "people:families.manage";
        /** Digital waiver and consent collection */
        readonly waivers: "people:waivers.collect";
        /** HMAC-based evidence for legal compliance */
        readonly evidence: "people:evidence.hmac";
    };
    readonly offerings: {
        /** CRUD for classes, services, and programs */
        readonly crud: "offerings:classes.manage";
        /** Level, term, and session configuration */
        readonly structure: "offerings:structure.configure";
        /** Multi-step enrollment wizard (admin) */
        readonly enrollment: "offerings:enrollment.wizard";
        /** Guest enrollment without login */
        readonly guestEnrollment: "offerings:enrollment.guest";
        /** Public self-service booking pages */
        readonly publicBooking: "offerings:booking.public";
    };
    readonly scheduling: {
        /** Month/week timetable (FullCalendar) — offerings + sessions, read-only */
        readonly calendarView: "scheduling:calendar.view";
        /** Client self-service slot booking → checkout → invoice */
        readonly clientBooking: "scheduling:booking.client";
        /** Admin availability rules and slot management */
        readonly adminBooking: "scheduling:booking.admin";
        /** Google Calendar OAuth — free/busy + push booked appointments as events */
        readonly googleCalendar: "scheduling:integration.google_calendar";
        /** No-show and late cancellation fee capture */
        readonly penalties: "scheduling:penalties.capture";
        /** AI-powered scheduling assistant */
        readonly aiAssistant: "scheduling:ai.assistant";
    };
    readonly billing: {
        /** Grow (Meshulam) payment gateway */
        readonly grow: "billing:payments.grow";
        /** Stripe payment gateway */
        readonly stripe: "billing:payments.stripe";
        /** Mock payment processor for testing */
        readonly mock: "billing:payments.mock";
        /** Per-family billing account management */
        readonly accounts: "billing:accounts.manage";
        /** Refund processing capabilities */
        readonly refunds: "billing:refunds.process";
        /** Recurring billing (הוראת קבע) */
        readonly recurring: "billing:recurring.enabled";
        /** Quote generation and deposit handling */
        readonly quotes: "billing:quotes.generate";
        /** Failed payment handling and dunning */
        readonly dunning: "billing:dunning.enabled";
        /** Payment-gated file and gallery delivery */
        readonly gatedDelivery: "billing:delivery.gated";
    };
    readonly finance: {
        /** Financial health monitoring dashboard */
        readonly monitoring: "finance:health.monitor";
        /** VAT calculation and compliance */
        readonly vat: "finance:vat.calculate";
        /** Simple expense logging */
        readonly expenseBasic: "finance:expenses.basic";
        /** Advanced expense tracking with VAT recovery */
        readonly expenseAdvanced: "finance:expenses.advanced";
        /** Accountant CSV export functionality */
        readonly csvExport: "finance:export.csv";
        /** Tax document generation and management */
        readonly taxDocs: "finance:documents.tax";
        /** Grow payment reference per transaction */
        readonly growRefs: "finance:references.grow";
        /** Real-time profit & loss dashboard */
        readonly realTimePL: "finance:reports.realtime";
        /** Annual accountant report generation */
        readonly annualReport: "finance:reports.annual";
        /** Threshold radar for עוסק פטור → מורשה */
        readonly thresholdRadar: "finance:threshold.radar";
        /**
         * BKMVDATA export for accounting systems.
         * Note: Consult accountant — historical BKMV data may be legally required
         * even if feature is disabled post-signup.
         */
        readonly bkmvExport: "finance:export.bkmv";
    };
    readonly comms: {
        /** Notification logging and audit trail */
        readonly logging: "comms:notifications.log";
        /** Contact preference management */
        readonly preferences: "comms:preferences.manage";
        /** Email OTP verification */
        readonly otpEmail: "comms:otp.email";
        /** SMS OTP verification */
        readonly otpSms: "comms:otp.sms";
        /** WhatsApp OTP verification */
        readonly otpWhatsapp: "comms:otp.whatsapp";
        /** WhatsApp payment reminders */
        readonly whatsappReminders: "comms:reminders.whatsapp";
        /** WhatsApp tax document delivery */
        readonly whatsappDocs: "comms:documents.whatsapp";
        /** Voice call reminders with Hebrew TTS */
        readonly voiceReminders: "comms:reminders.voice";
        /** Tax document email delivery */
        readonly emailTaxDocs: "comms:documents.email";
    };
    readonly ui: {
        /** Administrative panel access */
        readonly adminPanel: "ui:admin.panel";
        /** Client and parent portal */
        readonly clientPortal: "ui:client.portal";
        /** Failed document queue admin interface */
        readonly docQueue: "ui:documents.queue";
        /** Branded PDF invoice generation */
        readonly brandedPdfs: "ui:pdfs.branded";
        /** Client self-service document downloads */
        readonly selfServeDownloads: "ui:downloads.selfServe";
        /** Tenant onboarding checklist */
        readonly onboarding: "ui:onboarding.checklist";
        /** Enhanced Stripe+Grow UX polish */
        readonly paymentUx: "ui:payments.enhanced";
        /** AI content generation tools */
        readonly aiContent: "ui:content.ai";
        /** Photographer vertical theme */
        readonly themePhotographer: "ui:theme.photographer";
        /** Beautician vertical theme */
        readonly themeBeautician: "ui:theme.beautician";
        /** Dance studio vertical theme */
        readonly themeDanceStudio: "ui:theme.dance-studio";
    };
    readonly media: {
        /**
         * Payment-gated gallery delivery for photographers.
         * Note: Implementation deferred — placeholder for vertical preset.
         */
        readonly galleryGated: "media:gallery.gated";
    };
};
/**
 * Type-safe feature key derived from the FEATURES constant.
 * Use this type everywhere a feature key is expected — typos become compile errors.
 *
 * This recursive type extracts all leaf string values from the nested FEATURES object.
 */
type ExtractValues<T> = T extends object ? {
    [K in keyof T]: ExtractValues<T[K]>;
}[keyof T] : T;
export type FeatureKey = ExtractValues<typeof FEATURES>;
/**
 * Feature Dependencies
 *
 * Maps feature keys to their required prerequisite keys.
 * A feature cannot be enabled unless all its dependencies are also enabled.
 * Used by validateFeatureSet() to ensure coherent feature configurations.
 */
export declare const FEATURE_DEPENDENCIES: Partial<Record<FeatureKey, FeatureKey[]>>;
/**
 * Validates a feature set for dependency coherence.
 *
 * @param features - Array of feature keys to validate
 * @returns Object with valid boolean and array of error messages
 */
export declare function validateFeatureSet(features: FeatureKey[]): {
    valid: boolean;
    errors: string[];
};
/**
 * ESSENTIAL Tier Default Features
 *
 * Appointment-based freelancers with native slot booking (Essential tier).
 * Supports single payments or deposit+balance model.
 * Individual clients — no family billing units.
 *
 * Note: preset lives in packages/domain/skins/essential/ per ADR-001
 */
export declare const ESSENTIAL_FEATURES: FeatureKey[];
/**
 * PROFESSIONAL Tier Default Features
 *
 * Class-based businesses with terms, enrollment, and family billing.
 * Supports multi-child families, term-based structure, recurring monthly payments.
 * Student management with family accounts and enrollment tracking.
 *
 * Note: preset lives in packages/domain/skins/professional/ per ADR-001
 *
 * Note: scheduling:booking.client is NOT in this preset — class enrolment is the default path.
 * Professional tenants enable slot booking via tenant_feature_overrides when offering
 * private lessons or Essential-style services alongside group classes.
 */
export declare const PROFESSIONAL_FEATURES: FeatureKey[];
/**
 * PHOTOGRAPHER Vertical Preset (Essential tier base)
 *
 * Photographers with gated gallery delivery and appointment scheduling.
 * Individual clients, deposit+balance payment model.
 */
export declare const PHOTOGRAPHER_PRESET: FeatureKey[];
/**
 * BEAUTICIAN Vertical Preset (Essential tier base)
 *
 * Beauticians and personal service providers with appointment scheduling.
 * Quote generation, Grow and Stripe payments.
 */
export declare const BEAUTICIAN_PRESET: FeatureKey[];
/**
 * DANCE STUDIO Vertical Preset (Professional tier base)
 *
 * Dance studios with class-based structure, family billing, and recurring payments.
 * Full family management with dunning for failed payments.
 */
export declare const DANCE_STUDIO_PRESET: FeatureKey[];
export {};
//# sourceMappingURL=feature-registry.d.ts.map