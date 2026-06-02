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
export declare const TimeSchema: z.ZodEffects<z.ZodString, string, string>;
/** Accepts Postgres / Supabase timestamptz strings (lenient vs strict ISO). */
export declare const TimestampSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const TenantSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    subdomain: z.ZodString;
    language: z.ZodDefault<z.ZodEnum<["he", "en"]>>;
    country: z.ZodDefault<z.ZodEnum<["IL", "US"]>>;
    currency: z.ZodDefault<z.ZodString>;
    vat_rate: z.ZodDefault<z.ZodNumber>;
    prices_include_vat: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    subdomain: string;
    language: "he" | "en";
    country: "IL" | "US";
    currency: string;
    vat_rate: number;
    prices_include_vat: boolean;
}, {
    id: string;
    name: string;
    subdomain: string;
    language?: "he" | "en" | undefined;
    country?: "IL" | "US" | undefined;
    currency?: string | undefined;
    vat_rate?: number | undefined;
    prices_include_vat?: boolean | undefined;
}>;
export type Tenant = z.infer<typeof TenantSchema>;
export declare const TenantWhiteLabelSchema: z.ZodObject<{
    primary_color: z.ZodDefault<z.ZodString>;
    secondary_color: z.ZodOptional<z.ZodString>;
    accent_color: z.ZodOptional<z.ZodString>;
    logo: z.ZodOptional<z.ZodObject<{
        url: z.ZodString;
        height: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        height?: string | undefined;
    }, {
        url: string;
        height?: string | undefined;
    }>>;
    logo_dark: z.ZodOptional<z.ZodObject<{
        url: z.ZodString;
        height: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        height?: string | undefined;
    }, {
        url: string;
        height?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    primary_color: string;
    secondary_color?: string | undefined;
    accent_color?: string | undefined;
    logo?: {
        url: string;
        height?: string | undefined;
    } | undefined;
    logo_dark?: {
        url: string;
        height?: string | undefined;
    } | undefined;
}, {
    primary_color?: string | undefined;
    secondary_color?: string | undefined;
    accent_color?: string | undefined;
    logo?: {
        url: string;
        height?: string | undefined;
    } | undefined;
    logo_dark?: {
        url: string;
        height?: string | undefined;
    } | undefined;
}>;
export type TenantWhiteLabel = z.infer<typeof TenantWhiteLabelSchema>;
export declare const UserProfileSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    tenant_id: z.ZodString;
    role: z.ZodArray<z.ZodString, "many">;
    person_id: z.ZodNullable<z.ZodString>;
    language: z.ZodOptional<z.ZodNullable<z.ZodEnum<["he", "en"]>>>;
    country: z.ZodOptional<z.ZodNullable<z.ZodEnum<["IL", "US"]>>>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    email: string;
    tenant_id: string;
    role: string[];
    person_id: string | null;
    created_at: string;
    language?: "he" | "en" | null | undefined;
    country?: "IL" | "US" | null | undefined;
}, {
    id: string;
    email: string;
    tenant_id: string;
    role: string[];
    person_id: string | null;
    created_at: string;
    language?: "he" | "en" | null | undefined;
    country?: "IL" | "US" | null | undefined;
}>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export declare const LoginFormSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export type LoginForm = z.infer<typeof LoginFormSchema>;
export declare const PasswordLoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type PasswordLogin = z.infer<typeof PasswordLoginSchema>;
export declare const PublicOfferingSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    name: z.ZodString;
    category_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    category_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    season_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    day_of_week: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    start_time: z.ZodEffects<z.ZodString, string, string>;
    end_time: z.ZodEffects<z.ZodString, string, string>;
    price_minor: z.ZodNumber;
    currency: z.ZodOptional<z.ZodString>;
    max_capacity: z.ZodNumber;
    min_age: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    max_age: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    billing_mode: z.ZodDefault<z.ZodEnum<["one_time", "recurring"]>>;
    billing_interval: z.ZodOptional<z.ZodNullable<z.ZodEnum<["monthly", "quarterly", "annual"]>>>;
    current_engagements: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    tenant_id: string;
    start_time: string;
    end_time: string;
    price_minor: number;
    max_capacity: number;
    billing_mode: "one_time" | "recurring";
    currency?: string | undefined;
    category_id?: string | null | undefined;
    category_name?: string | null | undefined;
    season_id?: string | null | undefined;
    day_of_week?: number | null | undefined;
    min_age?: number | null | undefined;
    max_age?: number | null | undefined;
    billing_interval?: "monthly" | "quarterly" | "annual" | null | undefined;
    current_engagements?: number | undefined;
}, {
    id: string;
    name: string;
    tenant_id: string;
    start_time: string;
    end_time: string;
    price_minor: number;
    max_capacity: number;
    currency?: string | undefined;
    category_id?: string | null | undefined;
    category_name?: string | null | undefined;
    season_id?: string | null | undefined;
    day_of_week?: number | null | undefined;
    min_age?: number | null | undefined;
    max_age?: number | null | undefined;
    billing_mode?: "one_time" | "recurring" | undefined;
    billing_interval?: "monthly" | "quarterly" | "annual" | null | undefined;
    current_engagements?: number | undefined;
}>;
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
    status: z.ZodDefault<z.ZodEnum<["active", "inactive", "withdrawn"]>>;
    waiver_accepted_at: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    waiver_version: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
    updated_at: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    /** Computed client-side from date_of_birth; not a DB column */
    is_minor: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    status: "active" | "inactive" | "withdrawn";
    email: string | null;
    tenant_id: string;
    created_at: string;
    user_profile_id: string | null;
    account_id: string | null;
    date_of_birth: string | null;
    medical_notes: string | null;
    allergies: string | null;
    photo_consent: boolean;
    media_consent: boolean;
    emergency_contact_name?: string | null | undefined;
    emergency_contact_phone?: string | null | undefined;
    waiver_accepted_at?: string | null | undefined;
    waiver_version?: string | null | undefined;
    updated_at?: string | undefined;
    is_minor?: boolean | undefined;
}, {
    id: string;
    name: string;
    email: string | null;
    tenant_id: string;
    created_at: string;
    user_profile_id: string | null;
    account_id: string | null;
    date_of_birth: string | null;
    medical_notes: string | null;
    allergies: string | null;
    status?: "active" | "inactive" | "withdrawn" | undefined;
    emergency_contact_name?: string | null | undefined;
    emergency_contact_phone?: string | null | undefined;
    photo_consent?: boolean | undefined;
    media_consent?: boolean | undefined;
    waiver_accepted_at?: string | null | undefined;
    waiver_version?: string | null | undefined;
    updated_at?: string | undefined;
    is_minor?: boolean | undefined;
}>;
export type Person = z.infer<typeof PersonSchema>;
export declare const BillingAccountSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    account_holder_name: z.ZodString;
    primary_contact_email: z.ZodString;
    primary_contact_phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    payment_method: z.ZodDefault<z.ZodEnum<["card", "bank_transfer", "cash", "check"]>>;
    status: z.ZodDefault<z.ZodEnum<["active", "inactive", "archived"]>>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
    updated_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "active" | "inactive" | "archived";
    tenant_id: string;
    created_at: string;
    updated_at: string;
    account_holder_name: string;
    primary_contact_email: string;
    payment_method: "card" | "bank_transfer" | "cash" | "check";
    primary_contact_phone?: string | null | undefined;
}, {
    id: string;
    tenant_id: string;
    created_at: string;
    updated_at: string;
    account_holder_name: string;
    primary_contact_email: string;
    status?: "active" | "inactive" | "archived" | undefined;
    primary_contact_phone?: string | null | undefined;
    payment_method?: "card" | "bank_transfer" | "cash" | "check" | undefined;
}>;
export type BillingAccount = z.infer<typeof BillingAccountSchema>;
export declare const BillingAccountCreateSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    account_holder_name: z.ZodString;
    primary_contact_email: z.ZodString;
    primary_contact_phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    payment_method: z.ZodDefault<z.ZodEnum<["card", "bank_transfer", "cash", "check"]>>;
    status: z.ZodDefault<z.ZodEnum<["active", "inactive", "archived"]>>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
    updated_at: z.ZodEffects<z.ZodString, string, string>;
}, "id" | "tenant_id" | "created_at" | "updated_at">, "strip", z.ZodTypeAny, {
    status: "active" | "inactive" | "archived";
    account_holder_name: string;
    primary_contact_email: string;
    payment_method: "card" | "bank_transfer" | "cash" | "check";
    primary_contact_phone?: string | null | undefined;
}, {
    account_holder_name: string;
    primary_contact_email: string;
    status?: "active" | "inactive" | "archived" | undefined;
    primary_contact_phone?: string | null | undefined;
    payment_method?: "card" | "bank_transfer" | "cash" | "check" | undefined;
}>;
export type BillingAccountCreate = z.infer<typeof BillingAccountCreateSchema>;
export declare const ContactPreferencesSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    person_id: z.ZodNullable<z.ZodString>;
    account_member_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    email: z.ZodNullable<z.ZodString>;
    email_opted_in: z.ZodDefault<z.ZodBoolean>;
    whatsapp_number: z.ZodNullable<z.ZodString>;
    whatsapp_opted_in: z.ZodDefault<z.ZodBoolean>;
    whatsapp_verified: z.ZodDefault<z.ZodBoolean>;
    preferred_channel: z.ZodDefault<z.ZodEnum<["email", "whatsapp", "voice"]>>;
    language: z.ZodDefault<z.ZodEnum<["he", "en"]>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    language: "he" | "en";
    email: string | null;
    tenant_id: string;
    person_id: string | null;
    email_opted_in: boolean;
    whatsapp_number: string | null;
    whatsapp_opted_in: boolean;
    whatsapp_verified: boolean;
    preferred_channel: "email" | "whatsapp" | "voice";
    account_member_id?: string | null | undefined;
}, {
    id: string;
    email: string | null;
    tenant_id: string;
    person_id: string | null;
    whatsapp_number: string | null;
    language?: "he" | "en" | undefined;
    account_member_id?: string | null | undefined;
    email_opted_in?: boolean | undefined;
    whatsapp_opted_in?: boolean | undefined;
    whatsapp_verified?: boolean | undefined;
    preferred_channel?: "email" | "whatsapp" | "voice" | undefined;
}>;
export type ContactPreferences = z.infer<typeof ContactPreferencesSchema>;
export declare const AccountSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    person_id: z.ZodString;
    created_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenant_id: string;
    person_id: string;
    created_at: string;
    name?: string | null | undefined;
}, {
    id: string;
    tenant_id: string;
    person_id: string;
    created_at: string;
    name?: string | null | undefined;
}>;
export type Account = z.infer<typeof AccountSchema>;
export declare const AccountMemberSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    account_id: z.ZodString;
    user_profile_id: z.ZodNullable<z.ZodString>;
    person_id: z.ZodString;
    role: z.ZodEnum<["account_holder", "member", "sibling", "adult_student"]>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenant_id: string;
    role: "account_holder" | "member" | "sibling" | "adult_student";
    person_id: string;
    created_at: string;
    user_profile_id: string | null;
    account_id: string;
}, {
    id: string;
    tenant_id: string;
    role: "account_holder" | "member" | "sibling" | "adult_student";
    person_id: string;
    created_at: string;
    user_profile_id: string | null;
    account_id: string;
}>;
export type AccountMember = z.infer<typeof AccountMemberSchema>;
export declare const SeasonSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    name: z.ZodString;
    start_date: z.ZodString;
    end_date: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<["upcoming", "active", "completed", "archived"]>>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    status: "active" | "archived" | "upcoming" | "completed";
    tenant_id: string;
    created_at: string;
    start_date: string;
    end_date: string;
}, {
    id: string;
    name: string;
    tenant_id: string;
    created_at: string;
    start_date: string;
    end_date: string;
    status?: "active" | "archived" | "upcoming" | "completed" | undefined;
}>, {
    id: string;
    name: string;
    status: "active" | "archived" | "upcoming" | "completed";
    tenant_id: string;
    created_at: string;
    start_date: string;
    end_date: string;
}, {
    id: string;
    name: string;
    tenant_id: string;
    created_at: string;
    start_date: string;
    end_date: string;
    status?: "active" | "archived" | "upcoming" | "completed" | undefined;
}>;
export declare const CreateSeasonSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    start_date: z.ZodOptional<z.ZodString>;
    end_date: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["upcoming", "active", "completed", "archived"]>>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    status?: "active" | "archived" | "upcoming" | "completed" | undefined;
    start_date?: string | undefined;
    end_date?: string | undefined;
}, {
    name?: string | undefined;
    status?: "active" | "archived" | "upcoming" | "completed" | undefined;
    start_date?: string | undefined;
    end_date?: string | undefined;
}>, {
    name?: string | undefined;
    status?: "active" | "archived" | "upcoming" | "completed" | undefined;
    start_date?: string | undefined;
    end_date?: string | undefined;
}, {
    name?: string | undefined;
    status?: "active" | "archived" | "upcoming" | "completed" | undefined;
    start_date?: string | undefined;
    end_date?: string | undefined;
}>;
export type Season = z.infer<typeof SeasonSchema>;
export type CreateSeason = z.infer<typeof CreateSeasonSchema>;
export declare const CategorySchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    name: z.ZodString;
    sort_order: z.ZodNumber;
    created_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    tenant_id: string;
    created_at: string;
    sort_order: number;
}, {
    id: string;
    name: string;
    tenant_id: string;
    created_at: string;
    sort_order: number;
}>;
export type Category = z.infer<typeof CategorySchema>;
export declare const OfferingSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    season_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    category_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    staff_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodString;
    max_capacity: z.ZodNumber;
    min_age: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    max_age: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    price_minor: z.ZodNumber;
    currency: z.ZodDefault<z.ZodString>;
    day_of_week: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    start_time: z.ZodEffects<z.ZodString, string, string>;
    end_time: z.ZodEffects<z.ZodString, string, string>;
    is_public: z.ZodDefault<z.ZodBoolean>;
    billing_mode: z.ZodDefault<z.ZodEnum<["one_time", "recurring"]>>;
    delivery_mode: z.ZodDefault<z.ZodEnum<["scheduled", "intangible"]>>;
    billing_interval: z.ZodOptional<z.ZodNullable<z.ZodEnum<["monthly", "quarterly", "annual"]>>>;
    status: z.ZodDefault<z.ZodEnum<["active", "cancelled", "full"]>>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    currency: string;
    status: "active" | "cancelled" | "full";
    tenant_id: string;
    created_at: string;
    start_time: string;
    end_time: string;
    price_minor: number;
    max_capacity: number;
    billing_mode: "one_time" | "recurring";
    is_public: boolean;
    delivery_mode: "scheduled" | "intangible";
    category_id?: string | null | undefined;
    season_id?: string | null | undefined;
    day_of_week?: number | null | undefined;
    min_age?: number | null | undefined;
    max_age?: number | null | undefined;
    billing_interval?: "monthly" | "quarterly" | "annual" | null | undefined;
    staff_id?: string | null | undefined;
}, {
    id: string;
    name: string;
    tenant_id: string;
    created_at: string;
    start_time: string;
    end_time: string;
    price_minor: number;
    max_capacity: number;
    currency?: string | undefined;
    status?: "active" | "cancelled" | "full" | undefined;
    category_id?: string | null | undefined;
    season_id?: string | null | undefined;
    day_of_week?: number | null | undefined;
    min_age?: number | null | undefined;
    max_age?: number | null | undefined;
    billing_mode?: "one_time" | "recurring" | undefined;
    billing_interval?: "monthly" | "quarterly" | "annual" | null | undefined;
    staff_id?: string | null | undefined;
    is_public?: boolean | undefined;
    delivery_mode?: "scheduled" | "intangible" | undefined;
}>, {
    id: string;
    name: string;
    currency: string;
    status: "active" | "cancelled" | "full";
    tenant_id: string;
    created_at: string;
    start_time: string;
    end_time: string;
    price_minor: number;
    max_capacity: number;
    billing_mode: "one_time" | "recurring";
    is_public: boolean;
    delivery_mode: "scheduled" | "intangible";
    category_id?: string | null | undefined;
    season_id?: string | null | undefined;
    day_of_week?: number | null | undefined;
    min_age?: number | null | undefined;
    max_age?: number | null | undefined;
    billing_interval?: "monthly" | "quarterly" | "annual" | null | undefined;
    staff_id?: string | null | undefined;
}, {
    id: string;
    name: string;
    tenant_id: string;
    created_at: string;
    start_time: string;
    end_time: string;
    price_minor: number;
    max_capacity: number;
    currency?: string | undefined;
    status?: "active" | "cancelled" | "full" | undefined;
    category_id?: string | null | undefined;
    season_id?: string | null | undefined;
    day_of_week?: number | null | undefined;
    min_age?: number | null | undefined;
    max_age?: number | null | undefined;
    billing_mode?: "one_time" | "recurring" | undefined;
    billing_interval?: "monthly" | "quarterly" | "annual" | null | undefined;
    staff_id?: string | null | undefined;
    is_public?: boolean | undefined;
    delivery_mode?: "scheduled" | "intangible" | undefined;
}>;
export type Offering = z.infer<typeof OfferingSchema>;
export declare const GenderConfigSchema: z.ZodObject<{
    allowed_genders: z.ZodArray<z.ZodEnum<["male", "female"]>, "many">;
}, "strip", z.ZodTypeAny, {
    allowed_genders: ("male" | "female")[];
}, {
    allowed_genders: ("male" | "female")[];
}>;
export declare const LevelConfigSchema: z.ZodObject<{
    category_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    category_id: string;
}, {
    category_id: string;
}>;
export declare const DocumentConfigSchema: z.ZodObject<{
    doc_type: z.ZodString;
}, "strip", z.ZodTypeAny, {
    doc_type: string;
}, {
    doc_type: string;
}>;
export declare const ManualReviewConfigSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare const RequirementConfigSchema: z.ZodDiscriminatedUnion<"requirement_type", [z.ZodObject<{
    requirement_type: z.ZodLiteral<"gender">;
    config: z.ZodObject<{
        allowed_genders: z.ZodArray<z.ZodEnum<["male", "female"]>, "many">;
    }, "strip", z.ZodTypeAny, {
        allowed_genders: ("male" | "female")[];
    }, {
        allowed_genders: ("male" | "female")[];
    }>;
}, "strip", z.ZodTypeAny, {
    requirement_type: "gender";
    config: {
        allowed_genders: ("male" | "female")[];
    };
}, {
    requirement_type: "gender";
    config: {
        allowed_genders: ("male" | "female")[];
    };
}>, z.ZodObject<{
    requirement_type: z.ZodLiteral<"level">;
    config: z.ZodObject<{
        category_id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        category_id: string;
    }, {
        category_id: string;
    }>;
}, "strip", z.ZodTypeAny, {
    requirement_type: "level";
    config: {
        category_id: string;
    };
}, {
    requirement_type: "level";
    config: {
        category_id: string;
    };
}>, z.ZodObject<{
    requirement_type: z.ZodLiteral<"document_submitted">;
    config: z.ZodObject<{
        doc_type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        doc_type: string;
    }, {
        doc_type: string;
    }>;
}, "strip", z.ZodTypeAny, {
    requirement_type: "document_submitted";
    config: {
        doc_type: string;
    };
}, {
    requirement_type: "document_submitted";
    config: {
        doc_type: string;
    };
}>, z.ZodObject<{
    requirement_type: z.ZodLiteral<"manual_review">;
    config: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
}, "strip", z.ZodTypeAny, {
    requirement_type: "manual_review";
    config: {};
}, {
    requirement_type: "manual_review";
    config: {};
}>]>;
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
    created_at: z.ZodEffects<z.ZodString, string, string>;
    updated_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    tenant_id: string;
    created_at: string;
    updated_at: string;
    requirement_type: string;
    config: Record<string, unknown>;
    is_hard_block: boolean;
    display_text?: string | null | undefined;
}, {
    id: string;
    name: string;
    tenant_id: string;
    created_at: string;
    updated_at: string;
    requirement_type: string;
    config: Record<string, unknown>;
    display_text?: string | null | undefined;
    is_hard_block?: boolean | undefined;
}>;
export type RequirementTemplate = z.infer<typeof RequirementTemplateSchema>;
export declare const OfferingRequirementSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    offering_id: z.ZodString;
    requirement_template_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    config: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenant_id: string;
    created_at: string;
    offering_id: string;
    config?: Record<string, unknown> | null | undefined;
    requirement_template_id?: string | null | undefined;
}, {
    id: string;
    tenant_id: string;
    created_at: string;
    offering_id: string;
    config?: Record<string, unknown> | null | undefined;
    requirement_template_id?: string | null | undefined;
}>;
export type OfferingRequirement = z.infer<typeof OfferingRequirementSchema>;
export declare const EngagementSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    person_id: z.ZodString;
    offering_id: z.ZodString;
    season_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    billing_account_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodEnum<["pending_payment", "active", "admin_review", "pending_offer", "cancelled", "withdrawn"]>>;
    payment_received_at: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    cancelled_at: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    cancellation_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    cancelled_by: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
    updated_at: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "active" | "withdrawn" | "cancelled" | "pending_payment" | "admin_review" | "pending_offer";
    tenant_id: string;
    person_id: string;
    created_at: string;
    offering_id: string;
    season_id?: string | null | undefined;
    updated_at?: string | undefined;
    billing_account_id?: string | null | undefined;
    payment_received_at?: string | null | undefined;
    cancelled_at?: string | null | undefined;
    cancellation_reason?: string | null | undefined;
    cancelled_by?: string | null | undefined;
}, {
    id: string;
    tenant_id: string;
    person_id: string;
    created_at: string;
    offering_id: string;
    status?: "active" | "withdrawn" | "cancelled" | "pending_payment" | "admin_review" | "pending_offer" | undefined;
    season_id?: string | null | undefined;
    updated_at?: string | undefined;
    billing_account_id?: string | null | undefined;
    payment_received_at?: string | null | undefined;
    cancelled_at?: string | null | undefined;
    cancellation_reason?: string | null | undefined;
    cancelled_by?: string | null | undefined;
}>;
export type Engagement = z.infer<typeof EngagementSchema>;
export declare const CancelEnrolmentInputSchema: z.ZodObject<{
    engagementId: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    engagementId: string;
    reason?: string | undefined;
}, {
    engagementId: string;
    reason?: string | undefined;
}>;
export declare const OfferingSessionSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    offering_id: z.ZodString;
    session_date: z.ZodString;
    start_time: z.ZodEffects<z.ZodString, string, string>;
    end_time: z.ZodEffects<z.ZodString, string, string>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenant_id: string;
    created_at: string;
    start_time: string;
    end_time: string;
    offering_id: string;
    session_date: string;
}, {
    id: string;
    tenant_id: string;
    created_at: string;
    start_time: string;
    end_time: string;
    offering_id: string;
    session_date: string;
}>;
export type OfferingSession = z.infer<typeof OfferingSessionSchema>;
export declare const StaffSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    user_profile_id: z.ZodString;
    name: z.ZodString;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    contract_type: z.ZodDefault<z.ZodEnum<["employee", "contractor"]>>;
    hourly_rate_minor: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    tenant_id: string;
    created_at: string;
    user_profile_id: string;
    contract_type: "employee" | "contractor";
    email?: string | null | undefined;
    phone?: string | null | undefined;
    hourly_rate_minor?: number | null | undefined;
}, {
    id: string;
    name: string;
    tenant_id: string;
    created_at: string;
    user_profile_id: string;
    email?: string | null | undefined;
    phone?: string | null | undefined;
    contract_type?: "employee" | "contractor" | undefined;
    hourly_rate_minor?: number | null | undefined;
}>;
export type Staff = z.infer<typeof StaffSchema>;
export declare const NotificationLogSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    recipient_person_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    recipient_account_member_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    recipient_email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    recipient_phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    channel: z.ZodEnum<["email", "whatsapp", "voice"]>;
    template_name: z.ZodString;
    variables: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    subject: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    body_preview: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    external_msg_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodEnum<["sent", "delivered", "read", "failed", "bounced"]>>;
    failure_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sent_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "sent" | "delivered" | "read" | "failed" | "bounced";
    tenant_id: string;
    channel: "email" | "whatsapp" | "voice";
    template_name: string;
    sent_at: string;
    recipient_person_id?: string | null | undefined;
    recipient_account_member_id?: string | null | undefined;
    recipient_email?: string | null | undefined;
    recipient_phone?: string | null | undefined;
    variables?: Record<string, unknown> | null | undefined;
    subject?: string | null | undefined;
    body_preview?: string | null | undefined;
    external_msg_id?: string | null | undefined;
    failure_reason?: string | null | undefined;
}, {
    id: string;
    tenant_id: string;
    channel: "email" | "whatsapp" | "voice";
    template_name: string;
    sent_at: string;
    status?: "sent" | "delivered" | "read" | "failed" | "bounced" | undefined;
    recipient_person_id?: string | null | undefined;
    recipient_account_member_id?: string | null | undefined;
    recipient_email?: string | null | undefined;
    recipient_phone?: string | null | undefined;
    variables?: Record<string, unknown> | null | undefined;
    subject?: string | null | undefined;
    body_preview?: string | null | undefined;
    external_msg_id?: string | null | undefined;
    failure_reason?: string | null | undefined;
}>;
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
    ip_address: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenant_id: string;
    created_at: string;
    action: string;
    entity_type: string;
    actor_id?: string | null | undefined;
    actor_email?: string | null | undefined;
    entity_id?: string | null | undefined;
    before_state?: Record<string, unknown> | null | undefined;
    after_state?: Record<string, unknown> | null | undefined;
    ip_address?: string | null | undefined;
}, {
    id: string;
    tenant_id: string;
    created_at: string;
    action: string;
    entity_type: string;
    actor_id?: string | null | undefined;
    actor_email?: string | null | undefined;
    entity_id?: string | null | undefined;
    before_state?: Record<string, unknown> | null | undefined;
    after_state?: Record<string, unknown> | null | undefined;
    ip_address?: string | null | undefined;
}>;
export type AuditLog = z.infer<typeof AuditLogSchema>;
export declare const TenantNotificationTemplateSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    channel: z.ZodEnum<["email", "whatsapp", "voice"]>;
    template_name: z.ZodString;
    twilio_content_sid: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    email_template_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    voice_script_sid: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    version: z.ZodDefault<z.ZodNumber>;
    status: z.ZodDefault<z.ZodEnum<["pending", "approved", "rejected"]>>;
    approval_date: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    approval_notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
    updated_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "pending" | "approved" | "rejected";
    tenant_id: string;
    created_at: string;
    updated_at: string;
    channel: "email" | "whatsapp" | "voice";
    template_name: string;
    version: number;
    twilio_content_sid?: string | null | undefined;
    email_template_id?: string | null | undefined;
    voice_script_sid?: string | null | undefined;
    approval_date?: string | null | undefined;
    approval_notes?: string | null | undefined;
}, {
    id: string;
    tenant_id: string;
    created_at: string;
    updated_at: string;
    channel: "email" | "whatsapp" | "voice";
    template_name: string;
    status?: "pending" | "approved" | "rejected" | undefined;
    twilio_content_sid?: string | null | undefined;
    email_template_id?: string | null | undefined;
    voice_script_sid?: string | null | undefined;
    version?: number | undefined;
    approval_date?: string | null | undefined;
    approval_notes?: string | null | undefined;
}>;
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
    created_at: z.ZodEffects<z.ZodString, string, string>;
    updated_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    tenant_id: string;
    created_at: string;
    updated_at: string;
    sort_order: number;
    is_vat_eligible: boolean;
    is_active: boolean;
    description?: string | null | undefined;
    color?: string | null | undefined;
}, {
    id: string;
    name: string;
    tenant_id: string;
    created_at: string;
    updated_at: string;
    sort_order?: number | undefined;
    description?: string | null | undefined;
    color?: string | null | undefined;
    is_vat_eligible?: boolean | undefined;
    is_active?: boolean | undefined;
}>;
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;
export declare const NotificationPayloadSchema: z.ZodObject<{
    tenantId: z.ZodString;
    recipientId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    recipientType: z.ZodOptional<z.ZodNullable<z.ZodEnum<["person", "account_member"]>>>;
    recipientEmail: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    recipientPhone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    templateName: z.ZodString;
    channel: z.ZodEnum<["email", "whatsapp", "voice"]>;
    variables: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    channel: "email" | "whatsapp" | "voice";
    tenantId: string;
    templateName: string;
    variables?: Record<string, unknown> | undefined;
    recipientId?: string | null | undefined;
    recipientType?: "person" | "account_member" | null | undefined;
    recipientEmail?: string | null | undefined;
    recipientPhone?: string | null | undefined;
}, {
    channel: "email" | "whatsapp" | "voice";
    tenantId: string;
    templateName: string;
    variables?: Record<string, unknown> | undefined;
    recipientId?: string | null | undefined;
    recipientType?: "person" | "account_member" | null | undefined;
    recipientEmail?: string | null | undefined;
    recipientPhone?: string | null | undefined;
}>;
export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;
export declare const OtpEmailPayloadSchema: z.ZodObject<{
    email: z.ZodString;
    code: z.ZodString;
    expiryMinutes: z.ZodDefault<z.ZodNumber>;
    tenantId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code: string;
    email: string;
    expiryMinutes: number;
    tenantId?: string | undefined;
}, {
    code: string;
    email: string;
    tenantId?: string | undefined;
    expiryMinutes?: number | undefined;
}>;
export type OtpEmailPayload = z.infer<typeof OtpEmailPayloadSchema>;
export declare const VerifyWhatsAppOtpPayloadSchema: z.ZodObject<{
    phone: z.ZodString;
    code: z.ZodString;
    personId: z.ZodOptional<z.ZodString>;
    familyMemberId: z.ZodOptional<z.ZodString>;
    tenantId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code: string;
    phone: string;
    tenantId?: string | undefined;
    personId?: string | undefined;
    familyMemberId?: string | undefined;
}, {
    code: string;
    phone: string;
    tenantId?: string | undefined;
    personId?: string | undefined;
    familyMemberId?: string | undefined;
}>;
export type VerifyWhatsAppOtpPayload = z.infer<typeof VerifyWhatsAppOtpPayloadSchema>;
export declare const ContactPreferencesUpdateSchema: z.ZodObject<{
    whatsapp_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    whatsapp_opted_in: z.ZodOptional<z.ZodBoolean>;
    whatsapp_verified: z.ZodOptional<z.ZodBoolean>;
    email_opted_in: z.ZodOptional<z.ZodBoolean>;
    preferred_channel: z.ZodOptional<z.ZodNullable<z.ZodEnum<["email", "whatsapp"]>>>;
}, "strip", z.ZodTypeAny, {
    email_opted_in?: boolean | undefined;
    whatsapp_number?: string | null | undefined;
    whatsapp_opted_in?: boolean | undefined;
    whatsapp_verified?: boolean | undefined;
    preferred_channel?: "email" | "whatsapp" | null | undefined;
}, {
    email_opted_in?: boolean | undefined;
    whatsapp_number?: string | null | undefined;
    whatsapp_opted_in?: boolean | undefined;
    whatsapp_verified?: boolean | undefined;
    preferred_channel?: "email" | "whatsapp" | null | undefined;
}>;
export type ContactPreferencesUpdate = z.infer<typeof ContactPreferencesUpdateSchema>;
//# sourceMappingURL=schemas.d.ts.map