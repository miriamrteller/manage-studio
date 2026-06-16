import { z } from 'zod';
/**
 * Zod schemas for type-safe validation
 * Use on all external data: API responses, form inputs, webhooks
 * NO ANY TYPES - all data validated at runtime
 */
// Base types
export const UUIDSchema = z.string().uuid();
export const EmailSchema = z.string().email('Invalid email address');
export const PhoneSchema = z.string().regex(/^\+972\d{9}$/, 'Must be a valid Israeli phone number');
export const CurrencySchema = z.number().int().nonnegative();
export const DateSchema = z.string().date('Invalid date format');
/** HH:MM string; accepts Postgres TIME (HH:MM:SS) and normalizes to HH:MM */
export const TimeSchema = z.string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time format (HH:MM)')
    .transform((val) => val.slice(0, 5));
/** Accepts Postgres / Supabase timestamptz strings (lenient vs strict ISO). */
export const TimestampSchema = z.string().refine((val) => !Number.isNaN(Date.parse(val)), { message: 'Invalid datetime' });
// Tenant configuration
export const TenantSchema = z.object({
    id: UUIDSchema,
    name: z.string().min(1),
    subdomain: z.string().min(1),
    language: z.enum(['he', 'en']).default('he'),
    country: z.enum(['IL', 'US']).default('IL'),
    currency: z.string().default('ILS'),
    vat_rate: z.number().min(0).max(1).default(0.17),
    prices_include_vat: z.boolean().default(true),
});
// Tenant white-label configuration (brand customization)
export const TenantWhiteLabelSchema = z.object({
    primary_color: z.string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color (e.g., #76335a)')
        .default('#2563eb'),
    secondary_color: z.string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color')
        .optional(),
    accent_color: z.string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color')
        .optional(),
    logo: z.object({
        url: z.string().url('Invalid logo URL'),
        height: z.string().optional(),
    }).optional(),
    logo_dark: z.object({
        url: z.string().url('Invalid dark mode logo URL'),
        height: z.string().optional(),
    }).optional(),
});
// User profile
export const UserProfileSchema = z.object({
    id: UUIDSchema,
    email: EmailSchema,
    tenant_id: UUIDSchema,
    role: z.array(z.string()), // ['parent'], ['teacher', 'parent'], etc.
    person_id: UUIDSchema.nullable(),
    language: z.enum(['he', 'en']).nullable().optional(), // User override (NULL = use tenant)
    country: z.enum(['IL', 'US']).nullable().optional(), // User override (NULL = use tenant)
    created_at: TimestampSchema,
});
// Login form (magic link)
export const LoginFormSchema = z.object({
    email: EmailSchema,
});
// Password login form
export const PasswordLoginSchema = z.object({
    email: EmailSchema,
    password: z.string()
        .min(6, 'Password must be at least 6 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
});
// Public class (for landing page — matches get_public_offerings_by_subdomain RPC)
export const PublicOfferingSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    name: z.string().min(1),
    category_id: UUIDSchema.nullable().optional(),
    category_name: z.string().nullable().optional(),
    season_id: UUIDSchema.nullable().optional(),
    season_start_date: z.string().date().nullable().optional(),
    updated_at: TimestampSchema.optional(),
    day_of_week: z.number().int().min(0).max(6).nullable().optional(),
    start_time: TimeSchema,
    end_time: TimeSchema,
    price_minor: z.number().nonnegative(),
    currency: z.string().optional(),
    max_capacity: z.number().positive(),
    min_age: z.number().int().nonnegative().nullable().optional(),
    max_age: z.number().int().nonnegative().nullable().optional(),
    cover_image_path: z.string().nullable().optional(),
    billing_mode: z.enum(['one_time', 'recurring']).default('one_time'),
    billing_interval: z.enum(['monthly', 'quarterly', 'annual']).nullable().optional(),
    current_engagements: z.number().nonnegative().optional(),
    waiver_required: z.boolean().optional(),
});
// Person (aligned with migration 20260526000200_people.sql)
export const PersonSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    user_profile_id: UUIDSchema.nullable(),
    account_id: UUIDSchema.nullable(),
    name: z.string().min(1),
    email: z.string().email().nullable(),
    date_of_birth: DateSchema.nullable(),
    medical_notes: z.string().nullable(),
    allergies: z.string().nullable(),
    emergency_contact_name: z.string().nullable().optional(),
    emergency_contact_phone: z.string().nullable().optional(),
    photo_consent: z.boolean().default(false),
    media_consent: z.boolean().default(false),
    status: z.enum(['active', 'inactive', 'withdrawn']).default('active'),
    waiver_accepted_at: TimestampSchema.nullable().optional(),
    waiver_version: z.string().nullable().optional(),
    created_at: TimestampSchema,
    updated_at: TimestampSchema.optional(),
    /** Computed client-side from date_of_birth; not a DB column */
    is_minor: z.boolean().optional(),
});
// Billing account (migration 20260526001000_billing_accounts.sql)
export const BillingAccountSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    account_holder_name: z.string().min(1),
    primary_contact_email: EmailSchema,
    primary_contact_phone: z.string().nullable().optional(),
    payment_method: z
        .enum(['card', 'bank_transfer', 'cash', 'check'])
        .default('card'),
    status: z.enum(['active', 'inactive', 'archived']).default('active'),
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
});
export const BillingAccountCreateSchema = BillingAccountSchema.omit({
    id: true,
    tenant_id: true,
    created_at: true,
    updated_at: true,
});
// Contact preferences
export const ContactPreferencesSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    person_id: UUIDSchema.nullable(),
    account_member_id: UUIDSchema.nullable().optional(),
    email: z.string().email().nullable(),
    email_opted_in: z.boolean().default(true),
    whatsapp_number: z.string().nullable(),
    whatsapp_opted_in: z.boolean().default(false),
    whatsapp_verified: z.boolean().default(false),
    preferred_channel: z.enum(['email', 'whatsapp', 'voice']).default('email'),
    language: z.enum(['he', 'en']).default('he'),
});
// Family (group of related people)
// Contact columns (name, contact_person_name, contact_email, contact_phone) were added via
// Migration 004000 and are nullable for backwards compatibility with existing rows.
// Account (household) — primary contact is people row via person_id
export const AccountSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    name: z.string().nullable().optional(),
    person_id: UUIDSchema,
    created_at: TimestampSchema,
});
// Account member links a guardian person to an account
export const AccountMemberSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    account_id: UUIDSchema,
    user_profile_id: UUIDSchema.nullable(),
    person_id: UUIDSchema,
    role: z.enum(['account_holder', 'member', 'sibling', 'adult_student']),
    created_at: TimestampSchema,
});
// Term (semester/academic period)
// DB status CHECK: ('upcoming', 'active', 'completed', 'archived')
export const SeasonSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    name: z.string().min(1, 'Term name required'),
    start_date: z.string().date('Invalid date format'),
    end_date: z.string().date('Invalid date format'),
    status: z.enum(['upcoming', 'active', 'completed', 'archived']).default('upcoming'),
    created_at: TimestampSchema,
}).refine((data) => new Date(data.end_date) > new Date(data.start_date), {
    message: 'End date must be after start date',
    path: ['end_date'],
});
// Creatable/updatable term (excludes id, tenant_id, created_at)
export const CreateSeasonSchema = z.object({
    name: z.string().min(1, 'Term name required'),
    start_date: z.string().date('Invalid date format'),
    end_date: z.string().date('Invalid date format'),
    status: z.enum(['upcoming', 'active', 'completed', 'archived']).default('upcoming'),
}).partial().refine((data) => {
    // Skip validation if both dates are missing (partial update)
    if (!data.start_date || !data.end_date)
        return true;
    return new Date(data.end_date) > new Date(data.start_date);
}, {
    message: 'End date must be after start date',
    path: ['end_date'],
});
// Level (e.g., Grade 1, Grade 2, Beginner, Advanced)
export const CategorySchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    name: z.string().min(1, 'Level name required'),
    sort_order: z.number().int().nonnegative('Sort order must be >= 0'),
    created_at: TimestampSchema,
});
// Class (a course offered in a term at a specific level)
// DB: category_id nullable, day_of_week nullable, status includes 'full',
//     has is_public, billing_frequency, currency; staff_id added via Migration 004100
export const OfferingSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    season_id: UUIDSchema.nullable().optional(),
    category_id: UUIDSchema.nullable().optional(),
    staff_id: UUIDSchema.nullable().optional(),
    name: z.string().min(1, 'Class name required'),
    max_capacity: z.number().positive('Max capacity must be > 0'),
    min_age: z.number().int().nonnegative().nullable().optional(),
    max_age: z.number().int().nonnegative().nullable().optional(),
    cover_image_path: z.string().nullable().optional(),
    price_minor: z.number().nonnegative('Price must be >= 0'),
    currency: z.string().default('ILS'),
    day_of_week: z.number().int().min(0).max(6).nullable().optional(),
    start_time: TimeSchema,
    end_time: TimeSchema,
    is_public: z.boolean().default(true),
    billing_mode: z.enum(['one_time', 'recurring']).default('one_time'),
    delivery_mode: z.enum(['scheduled', 'intangible']).default('scheduled'),
    billing_interval: z.enum(['monthly', 'quarterly', 'annual']).nullable().optional(),
    status: z.enum(['active', 'cancelled', 'full']).default('active'),
    waiver_required: z.boolean().default(true),
    created_at: TimestampSchema,
}).refine((data) => {
    if (data.delivery_mode === 'intangible')
        return true;
    if (!data.start_time || !data.end_time)
        return true;
    return data.start_time < data.end_time;
}, {
    message: 'End time must be after start time',
    path: ['end_time'],
});
// Per-type config schemas for requirement_templates.config JSONB
// age_range is NOT here — it is a direct typed column on classes (min_age / max_age)
export const GenderConfigSchema = z.object({
    allowed_genders: z.array(z.enum(['male', 'female'])).min(1),
});
export const LevelConfigSchema = z.object({
    category_id: UUIDSchema,
});
export const DocumentConfigSchema = z.object({
    doc_type: z.string().min(1),
});
export const ManualReviewConfigSchema = z.object({});
export const RequirementConfigSchema = z.discriminatedUnion('requirement_type', [
    z.object({ requirement_type: z.literal('gender'), config: GenderConfigSchema }),
    z.object({ requirement_type: z.literal('level'), config: LevelConfigSchema }),
    z.object({ requirement_type: z.literal('document_submitted'), config: DocumentConfigSchema }),
    z.object({ requirement_type: z.literal('manual_review'), config: ManualReviewConfigSchema }),
]);
// Requirement template — tenant's reusable library entry
export const RequirementTemplateSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    name: z.string(),
    requirement_type: z.string(),
    config: z.record(z.unknown()),
    display_text: z.string().nullable().optional(),
    is_hard_block: z.boolean().default(true),
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
});
// Class requirement — links a class to a requirement template (or stores inline config)
export const OfferingRequirementSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    offering_id: UUIDSchema,
    requirement_template_id: UUIDSchema.nullable().optional(),
    config: z.record(z.unknown()).nullable().optional(),
    created_at: TimestampSchema,
});
// Enrolment (person enrolled in a class for a term)
export const EngagementSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    person_id: UUIDSchema,
    offering_id: UUIDSchema,
    season_id: UUIDSchema.nullable().optional(),
    billing_account_id: UUIDSchema.nullable().optional(),
    age_override_at: TimestampSchema.nullable().optional(),
    age_override_by: UUIDSchema.nullable().optional(),
    age_override_reason: z.string().max(500).nullable().optional(),
    age_review_note: z.string().max(1000).nullable().optional(),
    age_at_season_start: z.number().int().nonnegative().nullable().optional(),
    status: z
        .enum(['pending_payment', 'active', 'admin_review', 'pending_offer', 'cancelled', 'withdrawn', 'pending_waiver'])
        .default('pending_payment'),
    payment_received_at: TimestampSchema.nullable().optional(),
    cancelled_at: TimestampSchema.nullable().optional(),
    cancellation_reason: z.string().max(500).nullable().optional(),
    cancelled_by: UUIDSchema.nullable().optional(),
    waiver_evidence_id: UUIDSchema.nullable().optional(),
    created_at: TimestampSchema,
    updated_at: TimestampSchema.optional(),
});
export const CancelEnrolmentInputSchema = z.object({
    engagementId: z.string().uuid(),
    reason: z.string().max(500).optional(),
});
// Class session (individual meeting of a class)
export const OfferingSessionSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    offering_id: UUIDSchema,
    session_date: z.string().date('Invalid date format'),
    start_time: TimeSchema,
    end_time: TimeSchema,
    created_at: TimestampSchema,
});
// Teacher profile
export const StaffSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    user_profile_id: UUIDSchema,
    name: z.string().min(1, 'Teacher name required'),
    email: z.string().email().nullable().optional(),
    phone: z.string().nullable().optional(),
    contract_type: z.enum(['employee', 'contractor']).default('contractor'),
    hourly_rate_minor: z.number().nonnegative().nullable().optional(),
    created_at: TimestampSchema,
});
// Notification log (audit trail for all sent notifications)
export const NotificationLogSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    recipient_person_id: UUIDSchema.nullable().optional(),
    recipient_account_member_id: UUIDSchema.nullable().optional(),
    recipient_email: z.string().email().nullable().optional(),
    recipient_phone: z.string().regex(/^\+\d{1,15}$/, 'Invalid E.164 phone format').nullable().optional(),
    channel: z.enum(['email', 'whatsapp', 'voice']),
    template_name: z.string().min(1, 'Template name required'),
    variables: z.record(z.string(), z.unknown()).nullable().optional(),
    subject: z.string().nullable().optional(),
    body_preview: z.string().nullable().optional(),
    external_msg_id: z.string().nullable().optional(),
    status: z.enum(['sent', 'delivered', 'read', 'failed', 'bounced']).default('sent'),
    failure_reason: z.string().nullable().optional(),
    sent_at: TimestampSchema,
});
// Audit log (immutable record of all data changes)
export const AuditLogSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    actor_id: UUIDSchema.nullable().optional(),
    actor_email: z.string().email().nullable().optional(),
    action: z.string().min(1, 'Action required'),
    entity_type: z.string().min(1, 'Entity type required'),
    entity_id: UUIDSchema.nullable().optional(),
    before_state: z.record(z.string(), z.unknown()).nullable().optional(),
    after_state: z.record(z.string(), z.unknown()).nullable().optional(),
    ip_address: z.string().ip().nullable().optional(),
    created_at: TimestampSchema,
});
// Tenant notification templates (per-tenant email/WhatsApp templates)
export const TenantNotificationTemplateSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    channel: z.enum(['email', 'whatsapp', 'voice']),
    template_name: z.string().min(1, 'Template name required'),
    twilio_content_sid: z.string().nullable().optional(),
    email_template_id: z.string().nullable().optional(),
    voice_script_sid: z.string().nullable().optional(),
    version: z.number().int().positive().default(1),
    status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
    approval_date: TimestampSchema.nullable().optional(),
    approval_notes: z.string().nullable().optional(),
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
});
// Expense categories (per-tenant, configurable by school)
export const ExpenseCategorySchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    name: z.string().min(1, 'Category name required').max(100),
    description: z.string().max(500).nullable().optional(),
    color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid hex color format').nullable().optional(),
    is_vat_eligible: z.boolean().default(true),
    is_active: z.boolean().default(true),
    sort_order: z.number().int().nonnegative().default(0),
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
});
// Notification payload for send-notification Edge Function
export const NotificationPayloadSchema = z.object({
    tenantId: UUIDSchema,
    recipientId: UUIDSchema.nullable().optional(),
    recipientType: z.enum(['person', 'account_member']).nullable().optional(),
    recipientEmail: z.string().email().nullable().optional(),
    recipientPhone: z.string().regex(/^\+\d{1,15}$/, 'Invalid E.164 phone format').nullable().optional(),
    templateName: z.string().min(1, 'Template name required'),
    channel: z.enum(['email', 'whatsapp', 'voice']),
    variables: z.record(z.string(), z.unknown()).optional(),
});
// OTP email payload for send-otp-email Edge Function
export const OtpEmailPayloadSchema = z.object({
    email: z.string().email('Invalid email address'),
    code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only digits'),
    expiryMinutes: z.number().int().positive().default(10),
    tenantId: UUIDSchema.optional(),
});
// WhatsApp OTP verification payload for verify-whatsapp-otp Edge Function
export const VerifyWhatsAppOtpPayloadSchema = z.object({
    phone: z.string().regex(/^\+\d{1,15}$/, 'Invalid E.164 phone format'),
    code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only digits'),
    personId: UUIDSchema.optional(),
    familyMemberId: UUIDSchema.optional(),
    tenantId: UUIDSchema.optional(),
});
// Contact preferences update payload
export const ContactPreferencesUpdateSchema = z.object({
    whatsapp_number: z.string().regex(/^\+\d{1,15}$/, 'Invalid E.164 phone format').nullable().optional(),
    whatsapp_opted_in: z.boolean().optional(),
    whatsapp_verified: z.boolean().optional(),
    email_opted_in: z.boolean().optional(),
    preferred_channel: z.enum(['email', 'whatsapp']).nullable().optional(),
});
// =============================================================================
// Waiver — consent templates, evidence, and request/response schemas
// =============================================================================
export const ConsentTemplateSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    name: z.string().min(1).max(200),
    content: z.string().min(1),
    version: z.number().int().positive(),
    version_hash: z.string().length(64),
    status: z.enum(['draft', 'approved', 'active', 'archived']),
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
});
export const WaiverViewedRequestSchema = z.object({
    person_id: UUIDSchema,
    consent_template_id: UUIDSchema,
});
export const WaiverViewedResponseSchema = z.object({
    view_token: z.string().min(1),
    viewed_at_ts: z.number().int(),
    expires_at: z.string(),
});
export const WaiverAcceptRequestSchema = z.object({
    person_id: UUIDSchema,
    consent_template_id: UUIDSchema,
    consent_version: z.number().int().positive(),
    typed_name: z.string().min(2).max(200),
    idempotency_key: UUIDSchema,
    view_token: z.string().min(1),
    viewed_at_ts: z.number().int(),
    account_member_id: UUIDSchema.optional(),
    otp_verify_sid: z.string().optional(),
});
export const WaiverEvidenceSchema = z.object({
    id: UUIDSchema,
    tenant_id: UUIDSchema,
    person_id: UUIDSchema,
    account_member_id: UUIDSchema.nullable().optional(),
    consent_template_id: UUIDSchema,
    consent_version: z.number().int().positive(),
    consent_version_hash: z.string().length(64),
    wording_snapshot: z.string(),
    pdf_storage_path: z.string(),
    pdf_sha256: z.string().length(64),
    record_hmac: z.string().length(64),
    hmac_key_version: z.number().int().positive(),
    viewed_at: TimestampSchema.nullable().optional(),
    signed_by_name: z.string(),
    signed_by_email: z.string().nullable().optional(),
    signed_by_role: z.enum(['guardian', 'self', 'admin_attestation']),
    signature_method: z.enum(['typed_name_checkbox', 'admin_upload']),
    signed_at: TimestampSchema,
    ip_address: z.string().nullable().optional(),
    user_agent: z.string().nullable().optional(),
    accept_language: z.string().nullable().optional(),
    idempotency_key: z.string(),
    otp_verify_sid: z.string().nullable().optional(),
    guardian_confirmed: z.boolean().default(false),
    status: z.enum(['signed', 'superseded', 'revoked']),
    created_at: TimestampSchema,
    offering_id: UUIDSchema.nullable().optional(),
    // Joined display fields — present only when fetched via listEvidence (admin)
    people: z.object({ name: z.string() }).nullable().optional(),
    offerings: z.object({ name: z.string() }).nullable().optional(),
});
