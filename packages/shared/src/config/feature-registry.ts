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

export const FEATURES = {
  // Core platform functionality
  platform: {
    /** Multi-tenant architecture with tenant isolation */
    multiTenant: 'platform:tenant.isolation',
    /** User authentication and authorization */
    auth: 'platform:auth.enabled',
    /** Internationalization support (Hebrew/English) */
    i18n: 'platform:i18n.enabled',
    /** Tenant-level configuration management */
    settings: 'platform:settings.manage',
    /** 14-day trial period for new tenants */
    trial: 'platform:trial.enabled',
    /** Self-service tenant registration */
    selfSignup: 'platform:signup.selfServe',
    /** Super-admin dashboard access */
    superAdmin: 'platform:admin.super',
    /** Custom domain support */
    customDomains: 'platform:domains.custom',
    /** Visual theme customization */
    themeCustomizer: 'platform:themes.customize',
  },

  // People and family management
  people: {
    /** CRUD operations for people/contacts */
    crud: 'people:contacts.manage',
    /** Family and account relationship management */
    families: 'people:families.manage',
    /** Digital waiver and consent collection */
    waivers: 'people:waivers.collect',
    /** HMAC-based evidence for legal compliance */
    evidence: 'people:evidence.hmac',
  },

  // Class and service offerings
  offerings: {
    /** CRUD for classes, services, and programs */
    crud: 'offerings:classes.manage',
    /** Level, term, and session configuration */
    structure: 'offerings:structure.configure',
    /** Multi-step enrollment wizard (admin) */
    enrollment: 'offerings:enrollment.wizard',
    /** Guest enrollment without login */
    guestEnrollment: 'offerings:enrollment.guest',
    /** Public self-service booking pages */
    publicBooking: 'offerings:booking.public',
  },

  // Scheduling — native booking + optional Google Calendar sync (Cal.com out of scope)
  scheduling: {
    /** Month/week timetable (FullCalendar) — offerings + sessions, read-only */
    calendarView: 'scheduling:calendar.view',
    /** Client self-service slot booking → checkout → invoice */
    clientBooking: 'scheduling:booking.client',
    /** Admin availability rules and slot management */
    adminBooking: 'scheduling:booking.admin',
    /** Google Calendar OAuth — free/busy + push booked appointments as events */
    googleCalendar: 'scheduling:integration.google_calendar',
    /** No-show and late cancellation fee capture */
    penalties: 'scheduling:penalties.capture',
    /** AI-powered scheduling assistant */
    aiAssistant: 'scheduling:ai.assistant',
  },

  // Payment processing and billing
  billing: {
    /** Grow (Meshulam) payment gateway */
    grow: 'billing:payments.grow',
    /** Stripe payment gateway */
    stripe: 'billing:payments.stripe',
    /** Mock payment processor for testing */
    mock: 'billing:payments.mock',
    /** Per-family billing account management */
    accounts: 'billing:accounts.manage',
    /** Refund processing capabilities */
    refunds: 'billing:refunds.process',
    /** Recurring billing (הוראת קבע) */
    recurring: 'billing:recurring.enabled',
    /** Quote generation and deposit handling */
    quotes: 'billing:quotes.generate',
    /** Failed payment handling and dunning */
    dunning: 'billing:dunning.enabled',
    /** Payment-gated file and gallery delivery */
    gatedDelivery: 'billing:delivery.gated',
  },

  // Financial management and reporting
  finance: {
    /** Financial health monitoring dashboard */
    monitoring: 'finance:health.monitor',
    /** VAT calculation and compliance */
    vat: 'finance:vat.calculate',
    /** Simple expense logging */
    expenseBasic: 'finance:expenses.basic',
    /** Advanced expense tracking with VAT recovery */
    expenseAdvanced: 'finance:expenses.advanced',
    /** Accountant CSV export functionality */
    csvExport: 'finance:export.csv',
    /** Tax document generation and management */
    taxDocs: 'finance:documents.tax',
    /** Grow payment reference per transaction */
    growRefs: 'finance:references.grow',
    /** Real-time profit & loss dashboard */
    realTimePL: 'finance:reports.realtime',
    /** Annual accountant report generation */
    annualReport: 'finance:reports.annual',
    /** Threshold radar for עוסק פטור → מורשה */
    thresholdRadar: 'finance:threshold.radar',
    /**
     * BKMVDATA export for accounting systems.
     * Note: Consult accountant — historical BKMV data may be legally required
     * even if feature is disabled post-signup.
     */
    bkmvExport: 'finance:export.bkmv',
  },

  // Communication and notifications
  comms: {
    /** Notification logging and audit trail */
    logging: 'comms:notifications.log',
    /** Contact preference management */
    preferences: 'comms:preferences.manage',
    /** Email OTP verification */
    otpEmail: 'comms:otp.email',
    /** SMS OTP verification */
    otpSms: 'comms:otp.sms',
    /** WhatsApp OTP verification */
    otpWhatsapp: 'comms:otp.whatsapp',
    /** WhatsApp payment reminders */
    whatsappReminders: 'comms:reminders.whatsapp',
    /** WhatsApp tax document delivery */
    whatsappDocs: 'comms:documents.whatsapp',
    /** Voice call reminders with Hebrew TTS */
    voiceReminders: 'comms:reminders.voice',
    /** Tax document email delivery */
    emailTaxDocs: 'comms:documents.email',
  },

  // User interface and experience
  ui: {
    /** Administrative panel access */
    adminPanel: 'ui:admin.panel',
    /** Client and parent portal */
    clientPortal: 'ui:client.portal',
    /** Failed document queue admin interface */
    docQueue: 'ui:documents.queue',
    /** Branded PDF invoice generation */
    brandedPdfs: 'ui:pdfs.branded',
    /** Client self-service document downloads */
    selfServeDownloads: 'ui:downloads.selfServe',
    /** Tenant onboarding checklist */
    onboarding: 'ui:onboarding.checklist',
    /** Enhanced Stripe+Grow UX polish */
    paymentUx: 'ui:payments.enhanced',
    /** AI content generation tools */
    aiContent: 'ui:content.ai',
    /** Photographer vertical theme */
    themePhotographer: 'ui:theme.photographer',
    /** Beautician vertical theme */
    themeBeautician: 'ui:theme.beautician',
    /** Dance studio vertical theme */
    themeDanceStudio: 'ui:theme.dance-studio',
  },

  // Media management (deferred — placeholder for future implementation)
  media: {
    /**
     * Payment-gated gallery delivery for photographers.
     * Note: Implementation deferred — placeholder for vertical preset.
     */
    galleryGated: 'media:gallery.gated',
  },
} as const;

/**
 * Type-safe feature key derived from the FEATURES constant.
 * Use this type everywhere a feature key is expected — typos become compile errors.
 *
 * This recursive type extracts all leaf string values from the nested FEATURES object.
 */
type ExtractValues<T> = T extends object ? { [K in keyof T]: ExtractValues<T[K]> }[keyof T] : T;
export type FeatureKey = ExtractValues<typeof FEATURES>;

/**
 * Feature Dependencies
 *
 * Maps feature keys to their required prerequisite keys.
 * A feature cannot be enabled unless all its dependencies are also enabled.
 * Used by validateFeatureSet() to ensure coherent feature configurations.
 */
export const FEATURE_DEPENDENCIES: Partial<Record<FeatureKey, FeatureKey[]>> = {
  // Recurring billing requires base billing accounts
  [FEATURES.billing.recurring]: [FEATURES.billing.accounts],
  // Dunning requires recurring billing
  [FEATURES.billing.dunning]: [FEATURES.billing.recurring],
  // Family management requires people CRUD
  [FEATURES.people.families]: [FEATURES.people.crud],
  // Waivers require people CRUD
  [FEATURES.people.waivers]: [FEATURES.people.crud],
  // Evidence requires waivers
  [FEATURES.people.evidence]: [FEATURES.people.waivers],
  // Structure configuration requires offerings CRUD
  [FEATURES.offerings.structure]: [FEATURES.offerings.crud],
  // Enrollment wizard requires offerings CRUD
  [FEATURES.offerings.enrollment]: [FEATURES.offerings.crud],
  // Guest enrollment requires enrollment wizard
  [FEATURES.offerings.guestEnrollment]: [FEATURES.offerings.enrollment],
  // Public booking requires enrollment wizard
  [FEATURES.offerings.publicBooking]: [FEATURES.offerings.enrollment],
  // Client slot booking requires offerings + checkout path
  [FEATURES.scheduling.clientBooking]: [FEATURES.offerings.crud, FEATURES.billing.accounts],
  [FEATURES.scheduling.adminBooking]: [FEATURES.scheduling.clientBooking],
  // Google Calendar requires admin booking + tenant OAuth setup
  [FEATURES.scheduling.googleCalendar]: [
    FEATURES.scheduling.adminBooking,
    FEATURES.scheduling.clientBooking,
  ],
  // Calendar view requires offerings CRUD
  [FEATURES.scheduling.calendarView]: [FEATURES.offerings.crud],
  // Refunds require billing accounts
  [FEATURES.billing.refunds]: [FEATURES.billing.accounts],
  // Quotes require billing accounts
  [FEATURES.billing.quotes]: [FEATURES.billing.accounts],
  // Advanced expenses require basic expenses
  [FEATURES.finance.expenseAdvanced]: [FEATURES.finance.expenseBasic],
  // Annual report requires real-time P&L
  [FEATURES.finance.annualReport]: [FEATURES.finance.realTimePL],
  // WhatsApp docs require WhatsApp reminders capability
  [FEATURES.comms.whatsappDocs]: [FEATURES.comms.whatsappReminders],
  // Branded PDFs require tax docs
  [FEATURES.ui.brandedPdfs]: [FEATURES.finance.taxDocs],
  // Self-serve downloads require client portal
  [FEATURES.ui.selfServeDownloads]: [FEATURES.ui.clientPortal],
  // Gated delivery requires billing accounts
  [FEATURES.billing.gatedDelivery]: [FEATURES.billing.accounts],
  // Gated gallery requires gated delivery
  [FEATURES.media.galleryGated]: [FEATURES.billing.gatedDelivery],
};

/**
 * Validates a feature set for dependency coherence.
 *
 * @param features - Array of feature keys to validate
 * @returns Object with valid boolean and array of error messages
 */
export function validateFeatureSet(features: FeatureKey[]): { valid: boolean; errors: string[] } {
  const featureSet = new Set(features);
  const errors: string[] = [];

  for (const feature of features) {
    const dependencies = FEATURE_DEPENDENCIES[feature];
    if (dependencies) {
      for (const dep of dependencies) {
        if (!featureSet.has(dep)) {
          errors.push(`Feature "${feature}" requires "${dep}" to be enabled`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * ESSENTIAL Tier Default Features
 *
 * Appointment-based freelancers with native slot booking (Essential tier).
 * Supports single payments or deposit+balance model.
 * Individual clients — no family billing units.
 *
 * Note: preset lives in packages/domain/skins/essential/ per ADR-001
 */
export const ESSENTIAL_FEATURES: FeatureKey[] = [
  // Core platform
  FEATURES.platform.multiTenant,
  FEATURES.platform.auth,
  FEATURES.platform.i18n,
  FEATURES.platform.settings,
  FEATURES.platform.trial,
  FEATURES.platform.selfSignup,

  // People management (individual clients)
  FEATURES.people.crud,
  FEATURES.people.waivers,
  FEATURES.people.evidence,

  // Service offerings
  FEATURES.offerings.crud,
  FEATURES.offerings.enrollment,
  FEATURES.offerings.guestEnrollment,

  // Native appointment scheduling (Essential default)
  FEATURES.scheduling.clientBooking,
  FEATURES.scheduling.adminBooking,
  FEATURES.scheduling.googleCalendar,

  // Payment processing
  FEATURES.billing.grow,
  FEATURES.billing.stripe,
  FEATURES.billing.accounts,
  FEATURES.billing.refunds,
  FEATURES.billing.quotes,

  // Basic finance
  FEATURES.finance.monitoring,
  FEATURES.finance.vat,
  FEATURES.finance.expenseBasic,
  FEATURES.finance.csvExport,
  FEATURES.finance.taxDocs,
  FEATURES.finance.growRefs,

  // Communications
  FEATURES.comms.logging,
  FEATURES.comms.preferences,
  FEATURES.comms.otpEmail,
  FEATURES.comms.otpSms,
  FEATURES.comms.emailTaxDocs,

  // UI
  FEATURES.ui.adminPanel,
  FEATURES.ui.clientPortal,
];

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
export const PROFESSIONAL_FEATURES: FeatureKey[] = [
  // Core platform
  FEATURES.platform.multiTenant,
  FEATURES.platform.auth,
  FEATURES.platform.i18n,
  FEATURES.platform.settings,
  FEATURES.platform.trial,
  FEATURES.platform.selfSignup,
  FEATURES.platform.superAdmin,
  FEATURES.platform.customDomains,
  FEATURES.platform.themeCustomizer,

  // People and family management
  FEATURES.people.crud,
  FEATURES.people.families,
  FEATURES.people.waivers,
  FEATURES.people.evidence,

  // Class offerings
  FEATURES.offerings.crud,
  FEATURES.offerings.structure,
  FEATURES.offerings.enrollment,
  FEATURES.offerings.guestEnrollment,
  FEATURES.offerings.publicBooking,

  // Timetable display + optional slot booking add-ons
  FEATURES.scheduling.calendarView,
  FEATURES.scheduling.penalties,
  FEATURES.scheduling.aiAssistant,

  // Payment processing with recurring
  FEATURES.billing.grow,
  FEATURES.billing.stripe,
  FEATURES.billing.accounts,
  FEATURES.billing.refunds,
  FEATURES.billing.recurring,
  FEATURES.billing.quotes,
  FEATURES.billing.dunning,

  // Finance management
  FEATURES.finance.monitoring,
  FEATURES.finance.vat,
  FEATURES.finance.expenseBasic,
  FEATURES.finance.expenseAdvanced,
  FEATURES.finance.csvExport,
  FEATURES.finance.taxDocs,
  FEATURES.finance.growRefs,
  FEATURES.finance.realTimePL,
  FEATURES.finance.annualReport,
  FEATURES.finance.thresholdRadar,
  FEATURES.finance.bkmvExport,

  // Communications
  FEATURES.comms.logging,
  FEATURES.comms.preferences,
  FEATURES.comms.otpEmail,
  FEATURES.comms.otpSms,
  FEATURES.comms.otpWhatsapp,
  FEATURES.comms.whatsappReminders,
  FEATURES.comms.whatsappDocs,
  FEATURES.comms.voiceReminders,
  FEATURES.comms.emailTaxDocs,

  // UI
  FEATURES.ui.adminPanel,
  FEATURES.ui.clientPortal,
  FEATURES.ui.docQueue,
  FEATURES.ui.brandedPdfs,
  FEATURES.ui.selfServeDownloads,
  FEATURES.ui.onboarding,
  FEATURES.ui.paymentUx,
  FEATURES.ui.aiContent,
];

/**
 * PHOTOGRAPHER Vertical Preset (Essential tier base)
 *
 * Photographers with gated gallery delivery and appointment scheduling.
 * Individual clients, deposit+balance payment model.
 */
export const PHOTOGRAPHER_PRESET: FeatureKey[] = [
  ...ESSENTIAL_FEATURES,
  FEATURES.billing.gatedDelivery,
  FEATURES.media.galleryGated,
  FEATURES.ui.themePhotographer,
];

/**
 * BEAUTICIAN Vertical Preset (Essential tier base)
 *
 * Beauticians and personal service providers with appointment scheduling.
 * Quote generation, Grow and Stripe payments.
 */
export const BEAUTICIAN_PRESET: FeatureKey[] = [
  ...ESSENTIAL_FEATURES,
  FEATURES.ui.themeBeautician,
];

/**
 * DANCE STUDIO Vertical Preset (Professional tier base)
 *
 * Dance studios with class-based structure, family billing, and recurring payments.
 * Full family management with dunning for failed payments.
 */
export const DANCE_STUDIO_PRESET: FeatureKey[] = [
  ...PROFESSIONAL_FEATURES,
  FEATURES.ui.themeDanceStudio,
];

/*
DB_SCHEMA: Feature flag storage uses join table model.
See: core-architecture-decision.md section 4 for full join table schema.
Artifact 5 Batch 5 implements this.
*/
