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
  language: z.enum(['he', 'en']).default('he'),
  country: z.enum(['IL', 'US']).default('IL'),
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
  language: z.enum(['he', 'en']).nullable().optional(), // User override (NULL = use tenant)
  country: z.enum(['IL', 'US']).nullable().optional(), // User override (NULL = use tenant)
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
  level_id: UUIDSchema.nullable().optional(),
  start_time: z.string(), // HH:MM format
  end_time: z.string(),
  price_minor: z.number().nonnegative(),
  max_capacity: z.number().positive(),
  billing_frequency: z.enum(['monthly', 'per-session', 'weekly', 'annual']).default('monthly'),
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

// Family (group of related people)
export const FamilySchema = z.object({
  id: UUIDSchema,
  tenant_id: UUIDSchema,
  name: z.string().min(1, 'Family name required'),
  contact_person_name: z.string().min(1, 'Contact person name required'),
  contact_email: z.string().email('Invalid email'),
  contact_phone: z.string().regex(
    /^(050|051|052|053|054|055|056|058|059)\d{7}$/,
    'Invalid Israeli phone format'
  ),
  created_at: z.string().datetime(),
});

export type Family = z.infer<typeof FamilySchema>;

// Family member (relationship to family)
export const FamilyMemberSchema = z.object({
  id: UUIDSchema,
  tenant_id: UUIDSchema,
  family_id: UUIDSchema,
  person_id: UUIDSchema,
  user_profile_id: UUIDSchema.nullable(),
  role: z.enum(['parent', 'guardian', 'sibling', 'adult_student']),
  created_at: z.string().datetime(),
});

export type FamilyMember = z.infer<typeof FamilyMemberSchema>;

// Term (semester/academic period)
export const TermSchema = z.object({
  id: UUIDSchema,
  tenant_id: UUIDSchema,
  name: z.string().min(1, 'Term name required'),
  start_date: z.string().date('Invalid date format'),
  end_date: z.string().date('Invalid date format'),
  status: z.enum(['planning', 'active', 'completed']).default('planning'),
  created_at: z.string().datetime(),
}).refine((data) => new Date(data.end_date) > new Date(data.start_date), {
  message: 'End date must be after start date',
  path: ['end_date'],
});

export type Term = z.infer<typeof TermSchema>;

// Level (e.g., Grade 1, Grade 2, Beginner, Advanced)
export const LevelSchema = z.object({
  id: UUIDSchema,
  tenant_id: UUIDSchema,
  name: z.string().min(1, 'Level name required'),
  sort_order: z.number().int().nonnegative('Sort order must be >= 0'),
  created_at: z.string().datetime(),
});

export type Level = z.infer<typeof LevelSchema>;

// Class (a course offered in a term at a specific level)
export const ClassSchema = z.object({
  id: UUIDSchema,
  tenant_id: UUIDSchema,
  term_id: UUIDSchema,
  level_id: UUIDSchema,
  teacher_id: UUIDSchema.nullable().optional(),
  name: z.string().min(1, 'Class name required'),
  max_capacity: z.number().positive('Max capacity must be > 0'),
  price_minor: z.number().positive('Price must be > 0'),
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  status: z.enum(['active', 'cancelled']).default('active'),
  created_at: z.string().datetime(),
}).refine((data) => data.start_time < data.end_time, {
  message: 'End time must be after start time',
  path: ['end_time'],
});

export type Class = z.infer<typeof ClassSchema>;

// Class requirement (age, prerequisite, approval, etc.)
export const ClassRequirementSchema = z.object({
  id: UUIDSchema,
  tenant_id: UUIDSchema,
  class_id: UUIDSchema,
  requirement_type: z.enum(['min_age', 'prerequisite_class', 'admin_approval']),
  value: z.string(),
  display_text: z.string(),
  is_hard_block: z.boolean().default(true),
  created_at: z.string().datetime(),
});

export type ClassRequirement = z.infer<typeof ClassRequirementSchema>;

// Enrolment (person enrolled in a class for a term)
export const EnrolmentSchema = z.object({
  id: UUIDSchema,
  tenant_id: UUIDSchema,
  person_id: UUIDSchema,
  class_id: UUIDSchema,
  term_id: UUIDSchema,
  status: z.enum(['active', 'pending_payment', 'cancelled', 'withdrawn', 'waitlisted']).default('active'),
  prior_experience: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});

export type Enrolment = z.infer<typeof EnrolmentSchema>;
