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
    season_start_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    updated_at: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    day_of_week: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    start_time: z.ZodEffects<z.ZodString, string, string>;
    end_time: z.ZodEffects<z.ZodString, string, string>;
    price_minor: z.ZodNumber;
    currency: z.ZodOptional<z.ZodString>;
    max_capacity: z.ZodNumber;
    min_age: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    max_age: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    cover_image_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    billing_mode: z.ZodDefault<z.ZodEnum<["one_time", "recurring"]>>;
    billing_interval: z.ZodOptional<z.ZodNullable<z.ZodEnum<["monthly", "quarterly", "annual"]>>>;
    current_engagements: z.ZodOptional<z.ZodNumber>;
    waiver_required: z.ZodOptional<z.ZodBoolean>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
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
    season_start_date?: string | null | undefined;
    updated_at?: string | undefined;
    day_of_week?: number | null | undefined;
    min_age?: number | null | undefined;
    max_age?: number | null | undefined;
    cover_image_path?: string | null | undefined;
    billing_interval?: "monthly" | "quarterly" | "annual" | null | undefined;
    current_engagements?: number | undefined;
    waiver_required?: boolean | undefined;
    location?: string | null | undefined;
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
    season_start_date?: string | null | undefined;
    updated_at?: string | undefined;
    day_of_week?: number | null | undefined;
    min_age?: number | null | undefined;
    max_age?: number | null | undefined;
    cover_image_path?: string | null | undefined;
    billing_mode?: "one_time" | "recurring" | undefined;
    billing_interval?: "monthly" | "quarterly" | "annual" | null | undefined;
    current_engagements?: number | undefined;
    waiver_required?: boolean | undefined;
    location?: string | null | undefined;
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
    updated_at?: string | undefined;
    emergency_contact_name?: string | null | undefined;
    emergency_contact_phone?: string | null | undefined;
    waiver_accepted_at?: string | null | undefined;
    waiver_version?: string | null | undefined;
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
    updated_at?: string | undefined;
    emergency_contact_name?: string | null | undefined;
    emergency_contact_phone?: string | null | undefined;
    photo_consent?: boolean | undefined;
    media_consent?: boolean | undefined;
    waiver_accepted_at?: string | null | undefined;
    waiver_version?: string | null | undefined;
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
    cover_image_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
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
    waiver_required: z.ZodDefault<z.ZodBoolean>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
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
    waiver_required: boolean;
    is_public: boolean;
    delivery_mode: "scheduled" | "intangible";
    category_id?: string | null | undefined;
    season_id?: string | null | undefined;
    day_of_week?: number | null | undefined;
    min_age?: number | null | undefined;
    max_age?: number | null | undefined;
    cover_image_path?: string | null | undefined;
    billing_interval?: "monthly" | "quarterly" | "annual" | null | undefined;
    location?: string | null | undefined;
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
    cover_image_path?: string | null | undefined;
    billing_mode?: "one_time" | "recurring" | undefined;
    billing_interval?: "monthly" | "quarterly" | "annual" | null | undefined;
    waiver_required?: boolean | undefined;
    location?: string | null | undefined;
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
    waiver_required: boolean;
    is_public: boolean;
    delivery_mode: "scheduled" | "intangible";
    category_id?: string | null | undefined;
    season_id?: string | null | undefined;
    day_of_week?: number | null | undefined;
    min_age?: number | null | undefined;
    max_age?: number | null | undefined;
    cover_image_path?: string | null | undefined;
    billing_interval?: "monthly" | "quarterly" | "annual" | null | undefined;
    location?: string | null | undefined;
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
    cover_image_path?: string | null | undefined;
    billing_mode?: "one_time" | "recurring" | undefined;
    billing_interval?: "monthly" | "quarterly" | "annual" | null | undefined;
    waiver_required?: boolean | undefined;
    location?: string | null | undefined;
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
    age_override_at: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    age_override_by: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    age_override_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    age_review_note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    age_at_season_start: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    status: z.ZodDefault<z.ZodEnum<["pending_payment", "active", "admin_review", "pending_offer", "cancelled", "withdrawn", "pending_waiver"]>>;
    payment_received_at: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    cancelled_at: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    cancellation_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    cancelled_by: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    waiver_evidence_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
    updated_at: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "active" | "withdrawn" | "cancelled" | "pending_payment" | "admin_review" | "pending_offer" | "pending_waiver";
    tenant_id: string;
    person_id: string;
    created_at: string;
    offering_id: string;
    season_id?: string | null | undefined;
    updated_at?: string | undefined;
    billing_account_id?: string | null | undefined;
    age_override_at?: string | null | undefined;
    age_override_by?: string | null | undefined;
    age_override_reason?: string | null | undefined;
    age_review_note?: string | null | undefined;
    age_at_season_start?: number | null | undefined;
    payment_received_at?: string | null | undefined;
    cancelled_at?: string | null | undefined;
    cancellation_reason?: string | null | undefined;
    cancelled_by?: string | null | undefined;
    waiver_evidence_id?: string | null | undefined;
}, {
    id: string;
    tenant_id: string;
    person_id: string;
    created_at: string;
    offering_id: string;
    status?: "active" | "withdrawn" | "cancelled" | "pending_payment" | "admin_review" | "pending_offer" | "pending_waiver" | undefined;
    season_id?: string | null | undefined;
    updated_at?: string | undefined;
    billing_account_id?: string | null | undefined;
    age_override_at?: string | null | undefined;
    age_override_by?: string | null | undefined;
    age_override_reason?: string | null | undefined;
    age_review_note?: string | null | undefined;
    age_at_season_start?: number | null | undefined;
    payment_received_at?: string | null | undefined;
    cancelled_at?: string | null | undefined;
    cancellation_reason?: string | null | undefined;
    cancelled_by?: string | null | undefined;
    waiver_evidence_id?: string | null | undefined;
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
export declare const FinanceSummarySchema: z.ZodObject<{
    net_revenue_minor: z.ZodNumber;
    payment_count: z.ZodNumber;
    outstanding_engagements: z.ZodNumber;
    failed_payments_7d: z.ZodNumber;
    net_expenses_minor: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    net_revenue_minor: number;
    payment_count: number;
    outstanding_engagements: number;
    failed_payments_7d: number;
    net_expenses_minor: number;
}, {
    net_revenue_minor: number;
    payment_count: number;
    outstanding_engagements: number;
    failed_payments_7d: number;
    net_expenses_minor: number;
}>;
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
    created_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    currency: string;
    tenant_id: string;
    created_at: string;
    category_id: string;
    description: string;
    pretax_amount_minor: number;
    vat_amount_minor: number;
    total_amount_minor: number;
    expense_date: string;
    created_by: string;
    supplier_name?: string | null | undefined;
    supplier_vat_number?: string | null | undefined;
    receipt_storage_path?: string | null | undefined;
    corrects_expense_id?: string | null | undefined;
}, {
    id: string;
    currency: string;
    tenant_id: string;
    created_at: string;
    category_id: string;
    description: string;
    pretax_amount_minor: number;
    vat_amount_minor: number;
    total_amount_minor: number;
    expense_date: string;
    created_by: string;
    supplier_name?: string | null | undefined;
    supplier_vat_number?: string | null | undefined;
    receipt_storage_path?: string | null | undefined;
    corrects_expense_id?: string | null | undefined;
}>;
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
}, "strip", z.ZodTypeAny, {
    p_expense_id: string;
    p_category_id: string;
    p_description: string;
    p_pretax_amount_minor: number;
    p_vat_amount_minor: number;
    p_total_amount_minor: number;
    p_currency: string;
    p_expense_date: string;
    p_supplier_name?: string | null | undefined;
    p_supplier_vat_number?: string | null | undefined;
    p_receipt_storage_path?: string | null | undefined;
    p_corrects_expense_id?: string | null | undefined;
}, {
    p_expense_id: string;
    p_category_id: string;
    p_description: string;
    p_pretax_amount_minor: number;
    p_vat_amount_minor: number;
    p_total_amount_minor: number;
    p_currency: string;
    p_expense_date: string;
    p_supplier_name?: string | null | undefined;
    p_supplier_vat_number?: string | null | undefined;
    p_receipt_storage_path?: string | null | undefined;
    p_corrects_expense_id?: string | null | undefined;
}>;
export type ExpenseCreateInput = z.infer<typeof ExpenseCreateInputSchema>;
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
    status: z.ZodEnum<["pending", "succeeded", "failed", "refunded", "partially_refunded", "disputed"]>;
    charge_type: z.ZodEnum<["initial", "renewal", "setup", "adjustment", "refund"]>;
    provider: z.ZodString;
    payment_method: z.ZodOptional<z.ZodNullable<z.ZodEnum<["card", "cash", "bank_transfer", "other"]>>>;
    paid_at: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
    external_document_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    invoice_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    person: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
    }, {
        id: string;
        name: string;
    }>>>;
    offering: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
    }, {
        id: string;
        name: string;
    }>>>;
    engagement: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        status: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        status: string;
    }, {
        id: string;
        status: string;
    }>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    currency: string;
    status: "failed" | "pending" | "succeeded" | "refunded" | "partially_refunded" | "disputed";
    created_at: string;
    pretax_amount_minor: number;
    vat_amount_minor: number;
    total_amount_minor: number;
    charge_type: "initial" | "renewal" | "setup" | "adjustment" | "refund";
    provider: string;
    person_id?: string | null | undefined;
    account_id?: string | null | undefined;
    payment_method?: "card" | "bank_transfer" | "cash" | "other" | null | undefined;
    offering_id?: string | null | undefined;
    engagement_id?: string | null | undefined;
    paid_at?: string | null | undefined;
    external_document_number?: string | null | undefined;
    invoice_url?: string | null | undefined;
    person?: {
        id: string;
        name: string;
    } | null | undefined;
    offering?: {
        id: string;
        name: string;
    } | null | undefined;
    engagement?: {
        id: string;
        status: string;
    } | null | undefined;
}, {
    id: string;
    currency: string;
    status: "failed" | "pending" | "succeeded" | "refunded" | "partially_refunded" | "disputed";
    created_at: string;
    pretax_amount_minor: number;
    vat_amount_minor: number;
    total_amount_minor: number;
    charge_type: "initial" | "renewal" | "setup" | "adjustment" | "refund";
    provider: string;
    person_id?: string | null | undefined;
    account_id?: string | null | undefined;
    payment_method?: "card" | "bank_transfer" | "cash" | "other" | null | undefined;
    offering_id?: string | null | undefined;
    engagement_id?: string | null | undefined;
    paid_at?: string | null | undefined;
    external_document_number?: string | null | undefined;
    invoice_url?: string | null | undefined;
    person?: {
        id: string;
        name: string;
    } | null | undefined;
    offering?: {
        id: string;
        name: string;
    } | null | undefined;
    engagement?: {
        id: string;
        status: string;
    } | null | undefined;
}>;
export type PaymentLogRow = z.infer<typeof PaymentLogRowSchema>;
export declare const FinancePeriodKeySchema: z.ZodEnum<["month_current", "month_previous", "season_active"]>;
export type FinancePeriodKey = z.infer<typeof FinancePeriodKeySchema>;
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
export declare const ConsentTemplateSchema: z.ZodObject<{
    id: z.ZodString;
    tenant_id: z.ZodString;
    name: z.ZodString;
    content: z.ZodString;
    version: z.ZodNumber;
    version_hash: z.ZodString;
    status: z.ZodEnum<["draft", "approved", "active", "archived"]>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
    updated_at: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    status: "active" | "archived" | "approved" | "draft";
    tenant_id: string;
    created_at: string;
    updated_at: string;
    version: number;
    content: string;
    version_hash: string;
}, {
    id: string;
    name: string;
    status: "active" | "archived" | "approved" | "draft";
    tenant_id: string;
    created_at: string;
    updated_at: string;
    version: number;
    content: string;
    version_hash: string;
}>;
export type ConsentTemplate = z.infer<typeof ConsentTemplateSchema>;
export declare const WaiverViewedRequestSchema: z.ZodObject<{
    person_id: z.ZodString;
    consent_template_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    person_id: string;
    consent_template_id: string;
}, {
    person_id: string;
    consent_template_id: string;
}>;
export declare const WaiverViewedResponseSchema: z.ZodObject<{
    view_token: z.ZodString;
    viewed_at_ts: z.ZodNumber;
    expires_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    view_token: string;
    viewed_at_ts: number;
    expires_at: string;
}, {
    view_token: string;
    viewed_at_ts: number;
    expires_at: string;
}>;
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
}, "strip", z.ZodTypeAny, {
    person_id: string;
    consent_template_id: string;
    view_token: string;
    viewed_at_ts: number;
    consent_version: number;
    typed_name: string;
    idempotency_key: string;
    account_member_id?: string | undefined;
    otp_verify_sid?: string | undefined;
}, {
    person_id: string;
    consent_template_id: string;
    view_token: string;
    viewed_at_ts: number;
    consent_version: number;
    typed_name: string;
    idempotency_key: string;
    account_member_id?: string | undefined;
    otp_verify_sid?: string | undefined;
}>;
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
    viewed_at: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    signed_by_name: z.ZodString;
    signed_by_email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    signed_by_role: z.ZodEnum<["guardian", "self", "admin_attestation"]>;
    signature_method: z.ZodEnum<["typed_name_checkbox", "admin_upload"]>;
    signed_at: z.ZodEffects<z.ZodString, string, string>;
    ip_address: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    user_agent: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    accept_language: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    idempotency_key: z.ZodString;
    otp_verify_sid: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    guardian_confirmed: z.ZodDefault<z.ZodBoolean>;
    status: z.ZodEnum<["signed", "superseded", "revoked"]>;
    created_at: z.ZodEffects<z.ZodString, string, string>;
    offering_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    people: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
    }, {
        name: string;
    }>>>;
    offerings: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
    }, {
        name: string;
    }>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "signed" | "superseded" | "revoked";
    tenant_id: string;
    person_id: string;
    created_at: string;
    consent_template_id: string;
    consent_version: number;
    idempotency_key: string;
    consent_version_hash: string;
    wording_snapshot: string;
    pdf_storage_path: string;
    pdf_sha256: string;
    record_hmac: string;
    hmac_key_version: number;
    signed_by_name: string;
    signed_by_role: "guardian" | "self" | "admin_attestation";
    signature_method: "typed_name_checkbox" | "admin_upload";
    signed_at: string;
    guardian_confirmed: boolean;
    account_member_id?: string | null | undefined;
    offering_id?: string | null | undefined;
    ip_address?: string | null | undefined;
    otp_verify_sid?: string | null | undefined;
    viewed_at?: string | null | undefined;
    signed_by_email?: string | null | undefined;
    user_agent?: string | null | undefined;
    accept_language?: string | null | undefined;
    people?: {
        name: string;
    } | null | undefined;
    offerings?: {
        name: string;
    } | null | undefined;
}, {
    id: string;
    status: "signed" | "superseded" | "revoked";
    tenant_id: string;
    person_id: string;
    created_at: string;
    consent_template_id: string;
    consent_version: number;
    idempotency_key: string;
    consent_version_hash: string;
    wording_snapshot: string;
    pdf_storage_path: string;
    pdf_sha256: string;
    record_hmac: string;
    hmac_key_version: number;
    signed_by_name: string;
    signed_by_role: "guardian" | "self" | "admin_attestation";
    signature_method: "typed_name_checkbox" | "admin_upload";
    signed_at: string;
    account_member_id?: string | null | undefined;
    offering_id?: string | null | undefined;
    ip_address?: string | null | undefined;
    otp_verify_sid?: string | null | undefined;
    viewed_at?: string | null | undefined;
    signed_by_email?: string | null | undefined;
    user_agent?: string | null | undefined;
    accept_language?: string | null | undefined;
    guardian_confirmed?: boolean | undefined;
    people?: {
        name: string;
    } | null | undefined;
    offerings?: {
        name: string;
    } | null | undefined;
}>;
export type WaiverEvidence = z.infer<typeof WaiverEvidenceSchema>;
export declare const AdminDashboardTodayClassSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    /** Postgres TIME string, HH:MM:SS */
    start_time: z.ZodString;
    /** Postgres TIME string, HH:MM:SS */
    end_time: z.ZodString;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    max_capacity: z.ZodNumber;
    enrolled_count: z.ZodNumber;
    waitlist_count: z.ZodNumber;
    staff_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    max_capacity: number;
    enrolled_count: number;
    waitlist_count: number;
    location?: string | null | undefined;
    staff_name?: string | null | undefined;
}, {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    max_capacity: number;
    enrolled_count: number;
    waitlist_count: number;
    location?: string | null | undefined;
    staff_name?: string | null | undefined;
}>;
export declare const AdminDashboardOverviewSchema: z.ZodObject<{
    season_id: z.ZodNullable<z.ZodString>;
    season_name: z.ZodNullable<z.ZodString>;
    today_classes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        /** Postgres TIME string, HH:MM:SS */
        start_time: z.ZodString;
        /** Postgres TIME string, HH:MM:SS */
        end_time: z.ZodString;
        location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        max_capacity: z.ZodNumber;
        enrolled_count: z.ZodNumber;
        waitlist_count: z.ZodNumber;
        staff_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        start_time: string;
        end_time: string;
        max_capacity: number;
        enrolled_count: number;
        waitlist_count: number;
        location?: string | null | undefined;
        staff_name?: string | null | undefined;
    }, {
        id: string;
        name: string;
        start_time: string;
        end_time: string;
        max_capacity: number;
        enrolled_count: number;
        waitlist_count: number;
        location?: string | null | undefined;
        staff_name?: string | null | undefined;
    }>, "many">;
    term_enrolments_count: z.ZodNumber;
    admin_review_count: z.ZodNumber;
    pending_payment_count: z.ZodNumber;
    finance: z.ZodObject<{
        net_revenue_minor: z.ZodNumber;
        payment_count: z.ZodNumber;
        outstanding_engagements: z.ZodNumber;
        failed_payments_7d: z.ZodNumber;
        net_expenses_minor: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        net_revenue_minor: number;
        payment_count: number;
        outstanding_engagements: number;
        failed_payments_7d: number;
        net_expenses_minor: number;
    }, {
        net_revenue_minor: number;
        payment_count: number;
        outstanding_engagements: number;
        failed_payments_7d: number;
        net_expenses_minor: number;
    }>;
}, "strip", z.ZodTypeAny, {
    season_id: string | null;
    season_name: string | null;
    today_classes: {
        id: string;
        name: string;
        start_time: string;
        end_time: string;
        max_capacity: number;
        enrolled_count: number;
        waitlist_count: number;
        location?: string | null | undefined;
        staff_name?: string | null | undefined;
    }[];
    term_enrolments_count: number;
    admin_review_count: number;
    pending_payment_count: number;
    finance: {
        net_revenue_minor: number;
        payment_count: number;
        outstanding_engagements: number;
        failed_payments_7d: number;
        net_expenses_minor: number;
    };
}, {
    season_id: string | null;
    season_name: string | null;
    today_classes: {
        id: string;
        name: string;
        start_time: string;
        end_time: string;
        max_capacity: number;
        enrolled_count: number;
        waitlist_count: number;
        location?: string | null | undefined;
        staff_name?: string | null | undefined;
    }[];
    term_enrolments_count: number;
    admin_review_count: number;
    pending_payment_count: number;
    finance: {
        net_revenue_minor: number;
        payment_count: number;
        outstanding_engagements: number;
        failed_payments_7d: number;
        net_expenses_minor: number;
    };
}>;
export type AdminDashboardTodayClass = z.infer<typeof AdminDashboardTodayClassSchema>;
export type AdminDashboardOverview = z.infer<typeof AdminDashboardOverviewSchema>;
//# sourceMappingURL=schemas.d.ts.map