import { z } from 'zod';
/**
 * Zod schemas for type-safe validation
 * Use on all external data: API responses, form inputs, webhooks
 * NO ANY TYPES - all data validated at runtime
 */
export declare const UUIDSchema: z.ZodString;
export declare const EmailSchema: z.ZodString;
export declare const PhoneSchema: z.ZodString;
export declare const CurrencySchema: z.ZodNumber;
export declare const DateSchema: z.ZodString;
/** HH:MM string; accepts Postgres TIME (HH:MM:SS) and normalizes to HH:MM */
export declare const TimeSchema: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
/** Accepts Postgres / Supabase timestamptz strings (lenient vs strict ISO). */
export declare const TimestampSchema: z.ZodString;
export declare const TenantSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    subdomain: z.ZodString;
    language: z.ZodDefault<z.ZodEnum<{
        he: "he";
        en: "en";
    }>>;
    country: z.ZodDefault<z.ZodEnum<{
        IL: "IL";
        US: "US";
    }>>;
    currency: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type Tenant = z.infer<typeof TenantSchema>;
export declare const TenantWhiteLabelSchema: z.ZodObject<{
    primary_color: z.ZodDefault<z.ZodString>;
    secondary_color: z.ZodOptional<z.ZodString>;
    accent_color: z.ZodOptional<z.ZodString>;
    logo: z.ZodOptional<z.ZodObject<{
        url: z.ZodString;
        height: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    logo_dark: z.ZodOptional<z.ZodObject<{
        url: z.ZodString;
        height: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type TenantWhiteLabel = z.infer<typeof TenantWhiteLabelSchema>;
export declare const UserProfileSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    tenant_id: z.ZodString;
    role: z.ZodArray<z.ZodString>;
    person_id: z.ZodNullable<z.ZodString>;
    language: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        he: "he";
        en: "en";
    }>>>;
    country: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        IL: "IL";
        US: "US";
    }>>>;
    created_at: z.ZodString;
}, z.core.$strip>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export declare const LoginFormSchema: z.ZodObject<{
    email: z.ZodString;
}, z.core.$strip>;
export type LoginForm = z.infer<typeof LoginFormSchema>;
export declare const PasswordLoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export type PasswordLogin = z.infer<typeof PasswordLoginSchema>;
/** Rules for new passwords (portal set-password, etc.) */
export declare const NewPasswordSchema: z.ZodString;
export type NewPassword = z.infer<typeof NewPasswordSchema>;
export declare const PublicOfferingSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    name: z.ZodString;
    category_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    category_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    season_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    season_start_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    updated_at: z.ZodOptional<z.ZodString>;
    day_of_week: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    start_time: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    end_time: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    price_minor: z.ZodNumber;
    currency: z.ZodOptional<z.ZodString>;
    max_capacity: z.ZodNumber;
    min_age: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    max_age: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    cover_image_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    billing_mode: z.ZodDefault<z.ZodEnum<{
        one_time: "one_time";
        recurring: "recurring";
    }>>;
    billing_interval: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        monthly: "monthly";
        quarterly: "quarterly";
        annual: "annual";
    }>>>;
    current_engagements: z.ZodOptional<z.ZodNumber>;
    waiver_required: z.ZodOptional<z.ZodBoolean>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type PublicOffering = z.infer<typeof PublicOfferingSchema>;
export declare const PersonSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    user_profile_id: z.ZodNullable<z.ZodString>;
    account_id: z.ZodNullable<z.ZodString>;
    name: z.ZodString;
    email: z.ZodNullable<z.ZodString>;
    date_of_birth: z.ZodNullable<z.ZodString>;
    medical_notes: z.ZodNullable<z.ZodString>;
    allergies: z.ZodNullable<z.ZodString>;
    emergency_contact_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    emergency_contact_phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    photo_consent: z.ZodDefault<z.ZodBoolean>;
    media_consent: z.ZodDefault<z.ZodBoolean>;
    status: z.ZodDefault<z.ZodEnum<{
        active: "active";
        inactive: "inactive";
        withdrawn: "withdrawn";
    }>>;
    waiver_accepted_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    waiver_version: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_at: z.ZodString;
    updated_at: z.ZodOptional<z.ZodString>;
    is_minor: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type Person = z.infer<typeof PersonSchema>;
/**
 * billing_accounts as stored (migration 20260608001100). The payer is a person (person_id)
 * or a household (account_id); name, email and phone live on that person. business_name /
 * business_tax_id are the optional BUYER details for business invoices. Payment methods are
 * not columns: cards are saved tokens (get_billing_account_payment_method), cash and bank
 * transfers are per payment.
 */
export declare const BillingAccountSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    account_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    person_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    business_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    business_tax_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodEnum<{
        active: "active";
        inactive: "inactive";
        archived: "archived";
    }>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export type BillingAccount = z.infer<typeof BillingAccountSchema>;
/** What an admin may change on a billing account: business invoice details and status. */
export declare const BillingAccountUpdateSchema: z.ZodObject<{
    business_name: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<string | null, string>>>>;
    business_tax_id: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<string | null, string>>>>;
    status: z.ZodOptional<z.ZodEnum<{
        active: "active";
        inactive: "inactive";
        archived: "archived";
    }>>;
}, z.core.$strip>;
export type BillingAccountUpdate = z.infer<typeof BillingAccountUpdateSchema>;
export declare const ContactPreferencesSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    person_id: z.ZodNullable<z.ZodString>;
    account_member_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    email_opted_in: z.ZodDefault<z.ZodBoolean>;
    whatsapp_number: z.ZodNullable<z.ZodString>;
    whatsapp_opted_in: z.ZodDefault<z.ZodBoolean>;
    whatsapp_verified: z.ZodDefault<z.ZodBoolean>;
    notify_offering_cancellation: z.ZodDefault<z.ZodBoolean>;
    notify_payment_due: z.ZodDefault<z.ZodBoolean>;
    notify_waitlist: z.ZodDefault<z.ZodBoolean>;
    notify_schedule_change: z.ZodDefault<z.ZodBoolean>;
    notify_announcements: z.ZodDefault<z.ZodBoolean>;
    preferred_channel: z.ZodDefault<z.ZodEnum<{
        email: "email";
        whatsapp: "whatsapp";
        voice: "voice";
    }>>;
    language: z.ZodDefault<z.ZodEnum<{
        he: "he";
        en: "en";
    }>>;
}, z.core.$strip>;
export type ContactPreferences = z.infer<typeof ContactPreferencesSchema>;
export declare const AccountSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    person_id: z.ZodString;
    created_at: z.ZodString;
}, z.core.$strip>;
export type Account = z.infer<typeof AccountSchema>;
export declare const AccountMemberSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    account_id: z.ZodString;
    user_profile_id: z.ZodNullable<z.ZodString>;
    person_id: z.ZodString;
    role: z.ZodEnum<{
        account_holder: "account_holder";
        member: "member";
        sibling: "sibling";
        adult_student: "adult_student";
    }>;
    created_at: z.ZodString;
}, z.core.$strip>;
export type AccountMember = z.infer<typeof AccountMemberSchema>;
export declare const SeasonSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    name: z.ZodString;
    start_date: z.ZodString;
    end_date: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<{
        active: "active";
        archived: "archived";
        upcoming: "upcoming";
        completed: "completed";
    }>>;
    created_at: z.ZodString;
}, z.core.$strip>;
export declare const CreateSeasonSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    start_date: z.ZodOptional<z.ZodString>;
    end_date: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        active: "active";
        archived: "archived";
        upcoming: "upcoming";
        completed: "completed";
    }>>>;
}, z.core.$strip>;
export type Season = z.infer<typeof SeasonSchema>;
export type CreateSeason = z.infer<typeof CreateSeasonSchema>;
export declare const CategorySchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    name: z.ZodString;
    sort_order: z.ZodNumber;
    created_at: z.ZodString;
}, z.core.$strip>;
export type Category = z.infer<typeof CategorySchema>;
export declare const OfferingSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    season_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    category_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    staff_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodString;
    max_capacity: z.ZodNumber;
    min_age: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    max_age: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    cover_image_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    price_minor: z.ZodNumber;
    currency: z.ZodDefault<z.ZodString>;
    offering_type: z.ZodDefault<z.ZodEnum<{
        class: "class";
        appointment: "appointment";
    }>>;
    duration_mins: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    day_of_week: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    start_time: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>>;
    end_time: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>>;
    is_public: z.ZodDefault<z.ZodBoolean>;
    billing_mode: z.ZodDefault<z.ZodEnum<{
        one_time: "one_time";
        recurring: "recurring";
    }>>;
    delivery_mode: z.ZodDefault<z.ZodEnum<{
        scheduled: "scheduled";
        intangible: "intangible";
    }>>;
    billing_interval: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        monthly: "monthly";
        quarterly: "quarterly";
        annual: "annual";
    }>>>;
    status: z.ZodDefault<z.ZodEnum<{
        active: "active";
        cancelled: "cancelled";
        full: "full";
    }>>;
    waiver_required: z.ZodDefault<z.ZodBoolean>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_at: z.ZodString;
}, z.core.$strip>;
export type Offering = z.infer<typeof OfferingSchema>;
export declare const GenderConfigSchema: z.ZodObject<{
    allowed_genders: z.ZodArray<z.ZodEnum<{
        male: "male";
        female: "female";
    }>>;
}, z.core.$strip>;
export declare const LevelConfigSchema: z.ZodObject<{
    category_id: z.ZodString;
}, z.core.$strip>;
export declare const DocumentConfigSchema: z.ZodObject<{
    doc_type: z.ZodString;
}, z.core.$strip>;
export declare const ManualReviewConfigSchema: z.ZodObject<{}, z.core.$strip>;
export declare const RequirementConfigSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    requirement_type: z.ZodLiteral<"gender">;
    config: z.ZodObject<{
        allowed_genders: z.ZodArray<z.ZodEnum<{
            male: "male";
            female: "female";
        }>>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    requirement_type: z.ZodLiteral<"level">;
    config: z.ZodObject<{
        category_id: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    requirement_type: z.ZodLiteral<"document_submitted">;
    config: z.ZodObject<{
        doc_type: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    requirement_type: z.ZodLiteral<"manual_review">;
    config: z.ZodObject<{}, z.core.$strip>;
}, z.core.$strip>], "requirement_type">;
export type RequirementConfig = {
    requirement_type: 'gender';
    config: z.infer<typeof GenderConfigSchema>;
} | {
    requirement_type: 'level';
    config: z.infer<typeof LevelConfigSchema>;
} | {
    requirement_type: 'document_submitted';
    config: z.infer<typeof DocumentConfigSchema>;
} | {
    requirement_type: 'manual_review';
    config: z.infer<typeof ManualReviewConfigSchema>;
};
export declare const RequirementTemplateSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    name: z.ZodString;
    requirement_type: z.ZodString;
    config: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    display_text: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    is_hard_block: z.ZodDefault<z.ZodBoolean>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export type RequirementTemplate = z.infer<typeof RequirementTemplateSchema>;
export declare const OfferingRequirementSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    offering_id: z.ZodString;
    requirement_template_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    config: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    created_at: z.ZodString;
}, z.core.$strip>;
export type OfferingRequirement = z.infer<typeof OfferingRequirementSchema>;
export declare const EngagementSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    person_id: z.ZodString;
    offering_id: z.ZodString;
    season_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    billing_account_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    age_override_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    age_override_by: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    age_override_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    age_review_note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    age_at_season_start: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    status: z.ZodDefault<z.ZodEnum<{
        active: "active";
        withdrawn: "withdrawn";
        cancelled: "cancelled";
        pending_payment: "pending_payment";
        admin_review: "admin_review";
        pending_offer: "pending_offer";
        pending_waiver: "pending_waiver";
    }>>;
    payment_received_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    cancelled_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    cancellation_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    cancelled_by: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    payment_dunning_attempt_count: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    payment_dunning_next_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    waiver_evidence_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_at: z.ZodString;
    updated_at: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Engagement = z.infer<typeof EngagementSchema>;
export declare const CancelEnrolmentInputSchema: z.ZodObject<{
    engagementId: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const OfferingSessionSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    offering_id: z.ZodString;
    session_date: z.ZodString;
    start_time: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    end_time: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    created_at: z.ZodString;
}, z.core.$strip>;
export type OfferingSession = z.infer<typeof OfferingSessionSchema>;
export declare const StaffSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    user_profile_id: z.ZodString;
    name: z.ZodString;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    contract_type: z.ZodDefault<z.ZodEnum<{
        employee: "employee";
        contractor: "contractor";
    }>>;
    hourly_rate_minor: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    created_at: z.ZodString;
}, z.core.$strip>;
export type Staff = z.infer<typeof StaffSchema>;
export declare const NotificationLogSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    recipient_person_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    recipient_account_member_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    recipient_email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    recipient_phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    channel: z.ZodEnum<{
        email: "email";
        whatsapp: "whatsapp";
        voice: "voice";
    }>;
    template_name: z.ZodString;
    variables: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    subject: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    body_preview: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    external_msg_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodEnum<{
        sent: "sent";
        delivered: "delivered";
        read: "read";
        failed: "failed";
        bounced: "bounced";
        pending: "pending";
    }>>;
    failure_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_at: z.ZodOptional<z.ZodString>;
    sent_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type NotificationLog = z.infer<typeof NotificationLogSchema>;
export declare const AuditLogSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    actor_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    actor_email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    action: z.ZodString;
    entity_type: z.ZodString;
    entity_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    before_state: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    after_state: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    ip_address: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodIPv4, z.ZodIPv6]>>>;
    created_at: z.ZodString;
}, z.core.$strip>;
export type AuditLog = z.infer<typeof AuditLogSchema>;
export declare const TenantNotificationTemplateSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    channel: z.ZodEnum<{
        email: "email";
        whatsapp: "whatsapp";
        voice: "voice";
    }>;
    template_name: z.ZodString;
    twilio_content_sid: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    email_template_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    voice_script_sid: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    version: z.ZodDefault<z.ZodNumber>;
    status: z.ZodDefault<z.ZodEnum<{
        pending: "pending";
        approved: "approved";
        rejected: "rejected";
    }>>;
    approval_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    approval_notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export type TenantNotificationTemplate = z.infer<typeof TenantNotificationTemplateSchema>;
export declare const ExpenseCategorySchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    is_vat_eligible: z.ZodDefault<z.ZodBoolean>;
    is_active: z.ZodDefault<z.ZodBoolean>;
    sort_order: z.ZodDefault<z.ZodNumber>;
    catalog_key: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    catalog: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        name_en: z.ZodString;
        name_he: z.ZodString;
    }, z.core.$strip>>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;
export declare const FinanceSummarySchema: z.ZodObject<{
    net_revenue_minor: z.ZodNumber;
    payment_count: z.ZodNumber;
    outstanding_engagements: z.ZodNumber;
    failed_payments_7d: z.ZodNumber;
    net_expenses_minor: z.ZodNumber;
}, z.core.$strip>;
export type FinanceSummary = z.infer<typeof FinanceSummarySchema>;
export declare const ExpenseSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    category_id: z.ZodString;
    description: z.ZodString;
    pretax_amount_minor: z.ZodNumber;
    vat_amount_minor: z.ZodNumber;
    total_amount_minor: z.ZodNumber;
    currency: z.ZodString;
    supplier_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    supplier_vat_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    receipt_storage_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    expense_date: z.ZodString;
    corrects_expense_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_by: z.ZodString;
    created_at: z.ZodString;
}, z.core.$strip>;
export type Expense = z.infer<typeof ExpenseSchema>;
export declare const ExpenseCreateInputSchema: z.ZodObject<{
    p_expense_id: z.ZodString;
    p_category_id: z.ZodString;
    p_description: z.ZodString;
    p_pretax_amount_minor: z.ZodNumber;
    p_vat_amount_minor: z.ZodNumber;
    p_total_amount_minor: z.ZodNumber;
    p_currency: z.ZodString;
    p_supplier_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    p_supplier_vat_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    p_receipt_storage_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    p_expense_date: z.ZodString;
    p_corrects_expense_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type ExpenseCreateInput = z.infer<typeof ExpenseCreateInputSchema>;
/**
 * Tax document actually issued for a payment (payments.issued_document_kind).
 * Null = unknown (the provider issued it and didn't say which) or none yet.
 */
export declare const IssuedDocumentKindSchema: z.ZodEnum<{
    receipt: "receipt";
    tax_invoice_receipt: "tax_invoice_receipt";
    credit_note: "credit_note";
}>;
export type IssuedDocumentKind = z.infer<typeof IssuedDocumentKindSchema>;
/** Document queue rows embedded on a payment (latest attempt decides the "no document" reason). */
export declare const PaymentLogDocumentQueueSchema: z.ZodObject<{
    status: z.ZodString;
    document_kind: z.ZodString;
    created_at: z.ZodString;
}, z.core.$strip>;
export declare const PaymentLogRowSchema: z.ZodObject<{
    id: z.ZodString;
    person_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    account_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    offering_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    engagement_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    pretax_amount_minor: z.ZodNumber;
    vat_amount_minor: z.ZodNumber;
    total_amount_minor: z.ZodNumber;
    currency: z.ZodString;
    status: z.ZodEnum<{
        failed: "failed";
        pending: "pending";
        succeeded: "succeeded";
        refunded: "refunded";
        partially_refunded: "partially_refunded";
        disputed: "disputed";
    }>;
    charge_type: z.ZodEnum<{
        initial: "initial";
        renewal: "renewal";
        setup: "setup";
        adjustment: "adjustment";
        refund: "refund";
    }>;
    provider: z.ZodString;
    payment_method: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        card: "card";
        cash: "cash";
        bank_transfer: "bank_transfer";
        bit: "bit";
        other: "other";
    }>>>;
    paid_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_at: z.ZodString;
    external_document_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    invoice_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    external_document_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    issued_document_kind: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        receipt: "receipt";
        tax_invoice_receipt: "tax_invoice_receipt";
        credit_note: "credit_note";
    }>>>;
    invoice_issued_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    allocation_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    refunds_payment_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    document_queue: z.ZodOptional<z.ZodArray<z.ZodObject<{
        status: z.ZodString;
        document_kind: z.ZodString;
        created_at: z.ZodString;
    }, z.core.$strip>>>;
    billing_account: z.ZodPreprocess<z.ZodOptional<z.ZodNullable<z.ZodObject<{
        business_name: z.ZodNullable<z.ZodString>;
        business_tax_id: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>>, unknown>;
    person: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, z.core.$strip>>>;
    offering: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, z.core.$strip>>>;
    engagement: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        status: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type PaymentLogRow = z.infer<typeof PaymentLogRowSchema>;
export declare const FinancePeriodKeySchema: z.ZodEnum<{
    month_current: "month_current";
    month_previous: "month_previous";
    season_active: "season_active";
}>;
export type FinancePeriodKey = z.infer<typeof FinancePeriodKeySchema>;
export declare const NotificationPayloadSchema: z.ZodObject<{
    tenantId: z.ZodString;
    recipientId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    recipientType: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        person: "person";
        account_member: "account_member";
    }>>>;
    recipientEmail: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    recipientPhone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    templateName: z.ZodString;
    channel: z.ZodEnum<{
        email: "email";
        whatsapp: "whatsapp";
        voice: "voice";
    }>;
    variables: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;
export declare const OtpEmailPayloadSchema: z.ZodObject<{
    email: z.ZodString;
    code: z.ZodString;
    expiryMinutes: z.ZodDefault<z.ZodNumber>;
    tenantId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type OtpEmailPayload = z.infer<typeof OtpEmailPayloadSchema>;
export declare const VerifyWhatsAppOtpPayloadSchema: z.ZodObject<{
    phone: z.ZodString;
    code: z.ZodString;
    personId: z.ZodOptional<z.ZodString>;
    familyMemberId: z.ZodOptional<z.ZodString>;
    tenantId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type VerifyWhatsAppOtpPayload = z.infer<typeof VerifyWhatsAppOtpPayloadSchema>;
export declare const ContactPreferencesUpdateSchema: z.ZodObject<{
    whatsapp_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    whatsapp_opted_in: z.ZodOptional<z.ZodBoolean>;
    whatsapp_verified: z.ZodOptional<z.ZodBoolean>;
    email_opted_in: z.ZodOptional<z.ZodBoolean>;
    preferred_channel: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        email: "email";
        whatsapp: "whatsapp";
    }>>>;
    notify_offering_cancellation: z.ZodOptional<z.ZodBoolean>;
    notify_payment_due: z.ZodOptional<z.ZodBoolean>;
    notify_waitlist: z.ZodOptional<z.ZodBoolean>;
    notify_schedule_change: z.ZodOptional<z.ZodBoolean>;
    notify_announcements: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type ContactPreferencesUpdate = z.infer<typeof ContactPreferencesUpdateSchema>;
export declare const ConsentTemplateSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    name: z.ZodString;
    content: z.ZodString;
    version: z.ZodNumber;
    version_hash: z.ZodString;
    status: z.ZodEnum<{
        active: "active";
        archived: "archived";
        approved: "approved";
        draft: "draft";
    }>;
    audience: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        child: "child";
        adult: "adult";
    }>>>;
    language: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        he: "he";
        en: "en";
    }>>>;
    lawyer_reviewed_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export type ConsentTemplate = z.infer<typeof ConsentTemplateSchema>;
/** Minimal consent template fields required for the waiver signing UI. */
export declare const WaiverSigningConsentTemplateSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    language: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        he: "he";
        en: "en";
    }>>>;
    version: z.ZodNumber;
    content: z.ZodString;
}, z.core.$strip>;
export type WaiverSigningConsentTemplate = z.infer<typeof WaiverSigningConsentTemplateSchema>;
export declare const WaiverViewedRequestSchema: z.ZodObject<{
    person_id: z.ZodString;
    consent_template_id: z.ZodString;
}, z.core.$strip>;
export declare const WaiverViewedResponseSchema: z.ZodObject<{
    view_token: z.ZodString;
    viewed_at_ts: z.ZodNumber;
    expires_at: z.ZodString;
}, z.core.$strip>;
export declare const WaiverAcceptRequestSchema: z.ZodObject<{
    person_id: z.ZodString;
    consent_template_id: z.ZodString;
    consent_version: z.ZodNumber;
    typed_name: z.ZodString;
    idempotency_key: z.ZodString;
    view_token: z.ZodString;
    viewed_at_ts: z.ZodNumber;
    account_member_id: z.ZodOptional<z.ZodString>;
    otp_verify_sid: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type WaiverAcceptRequest = z.infer<typeof WaiverAcceptRequestSchema>;
export declare const WaiverEvidenceSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    person_id: z.ZodString;
    account_member_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    consent_template_id: z.ZodString;
    consent_version: z.ZodNumber;
    consent_version_hash: z.ZodString;
    wording_snapshot: z.ZodString;
    pdf_storage_path: z.ZodString;
    pdf_sha256: z.ZodString;
    record_hmac: z.ZodString;
    hmac_key_version: z.ZodNumber;
    viewed_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    signed_by_name: z.ZodString;
    signed_by_email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    signed_by_role: z.ZodEnum<{
        guardian: "guardian";
        self: "self";
        admin_attestation: "admin_attestation";
    }>;
    signature_method: z.ZodEnum<{
        typed_name_checkbox: "typed_name_checkbox";
        admin_upload: "admin_upload";
    }>;
    signed_at: z.ZodString;
    ip_address: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    user_agent: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    accept_language: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    idempotency_key: z.ZodString;
    otp_verify_sid: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    guardian_confirmed: z.ZodDefault<z.ZodBoolean>;
    status: z.ZodEnum<{
        signed: "signed";
        superseded: "superseded";
        revoked: "revoked";
    }>;
    created_at: z.ZodString;
    offering_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    signer_id_masked: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    people: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        name: z.ZodString;
    }, z.core.$strip>>>;
    offerings: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        name: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type WaiverEvidence = z.infer<typeof WaiverEvidenceSchema>;
export declare const AdminDashboardTodayClassSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    start_time: z.ZodString;
    end_time: z.ZodString;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    max_capacity: z.ZodNumber;
    enrolled_count: z.ZodNumber;
    waitlist_count: z.ZodNumber;
    staff_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const AdminDashboardOverviewSchema: z.ZodObject<{
    season_id: z.ZodNullable<z.ZodString>;
    season_name: z.ZodNullable<z.ZodString>;
    today_classes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        start_time: z.ZodString;
        end_time: z.ZodString;
        location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        max_capacity: z.ZodNumber;
        enrolled_count: z.ZodNumber;
        waitlist_count: z.ZodNumber;
        staff_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
    term_enrolments_count: z.ZodNumber;
    admin_review_count: z.ZodNumber;
    pending_payment_count: z.ZodNumber;
    finance: z.ZodObject<{
        net_revenue_minor: z.ZodNumber;
        payment_count: z.ZodNumber;
        outstanding_engagements: z.ZodNumber;
        failed_payments_7d: z.ZodNumber;
        net_expenses_minor: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type AdminDashboardTodayClass = z.infer<typeof AdminDashboardTodayClassSchema>;
export type AdminDashboardOverview = z.infer<typeof AdminDashboardOverviewSchema>;
//# sourceMappingURL=schemas.d.ts.map