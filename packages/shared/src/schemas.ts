import { z } from 'zod';

/**
 * Zod schemas for type-safe validation
 * Use on all external data: API responses, form inputs, webhooks
 * NO ANY TYPES - all data validated at runtime
 */

// Base types
export const UUIDSchema = z.string().uuid();

export const EmailSchema = z.string().email('Invalid email address');

export const PhoneSchema = z.string().regex(
  /^\+972\d{9}$/,
  'Must be a valid Israeli phone number'
);

export const CurrencySchema = z.number().int().nonnegative();

export const DateSchema = z.string().date('Invalid date format');

// Tenant configuration
export const TenantSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1),
  subdomain: z.string().min(1),
  locale: z.enum(['he-IL', 'en-US']).default('he-IL'),
  dir: z.enum(['rtl', 'ltr']).default('rtl'),
  primary_color: z.string().default('#76335a'),
  accent_color: z.string().default('#e99ac4'),
  currency: z.string().default('ILS'),
  vat_rate: z.number().min(0).max(1).default(0.17),
});

export type Tenant = z.infer<typeof TenantSchema>;

// User profile
export const UserProfileSchema = z.object({
  id: UUIDSchema,
  email: EmailSchema,
  tenant_id: UUIDSchema,
  role: z.array(z.string()), // ['parent'], ['teacher', 'parent'], etc.
  person_id: UUIDSchema.nullable(),
  created_at: z.string().datetime(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

// Login form
export const LoginFormSchema = z.object({
  email: EmailSchema,
});

export type LoginForm = z.infer<typeof LoginFormSchema>;

// Public class (for landing page)
export const PublicClassSchema = z.object({
  id: UUIDSchema,
  tenant_id: UUIDSchema,
  name: z.string().min(1),
  level_id: UUIDSchema.nullable(),
  start_time: z.string(), // HH:MM format
  end_time: z.string(),
  price_minor: z.number().nonnegative(),
  max_capacity: z.number().positive(),
  current_enrolments: z.number().nonnegative().optional(),
});

export type PublicClass = z.infer<typeof PublicClassSchema>;

// Person
export const PersonSchema = z.object({
  id: UUIDSchema,
  tenant_id: UUIDSchema,
  user_profile_id: UUIDSchema.nullable(),
  family_id: UUIDSchema.nullable(),
  name: z.string().min(1),
  email: z.string().email().nullable(),
  date_of_birth: DateSchema.nullable(),
  is_minor: z.boolean(),
  medical_notes: z.string().nullable(),
  allergies: z.string().nullable(),
  status: z.enum(['active', 'inactive', 'withdrawn']).default('active'),
  created_at: z.string().datetime(),
});

export type Person = z.infer<typeof PersonSchema>;

// Contact preferences
export const ContactPreferencesSchema = z.object({
  id: UUIDSchema,
  tenant_id: UUIDSchema,
  person_id: UUIDSchema.nullable(),
  email: z.string().email().nullable(),
  email_opted_in: z.boolean().default(true),
  whatsapp_number: z.string().nullable(),
  whatsapp_opted_in: z.boolean().default(false),
  whatsapp_verified: z.boolean().default(false),
  preferred_channel: z.enum(['email', 'whatsapp', 'voice']).default('email'),
  language: z.enum(['he', 'en']).default('he'),
});

export type ContactPreferences = z.infer<typeof ContactPreferencesSchema>;

