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
  currency: z.string().default('ILS'),
  vat_rate: z.number().min(0).max(1).default(0.17),
});

export type Tenant = z.infer<typeof TenantSchema>;

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

export type TenantWhiteLabel = z.infer<typeof TenantWhiteLabelSchema>;

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

// Login form (magic link)
export const LoginFormSchema = z.object({
  email: EmailSchema,
});

export type LoginForm = z.infer<typeof LoginFormSchema>;

// Password login form
export const PasswordLoginSchema = z.object({
  email: EmailSchema,
  password: z.string()
    .min(6, 'Password must be at least 6 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export type PasswordLogin = z.infer<typeof PasswordLoginSchema>;

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

// Creatable/updatable term (excludes id, tenant_id, created_at)
export const CreateTermSchema = z.object({
  name: z.string().min(1, 'Term name required'),
  start_date: z.string().date('Invalid date format'),
  end_date: z.string().date('Invalid date format'),
  status: z.enum(['planning', 'active', 'completed']).default('planning'),
}).partial().refine((data) => {
  // Skip validation if both dates are missing (partial update)
  if (!data.start_date || !data.end_date) return true;
  return new Date(data.end_date) > new Date(data.start_date);
}, {
  message: 'End date must be after start date',
  path: ['end_date'],
});

export type Term = z.infer<typeof TermSchema>;
export type CreateTerm = z.infer<typeof CreateTermSchema>;

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

// Class session (individual meeting of a class)
export const ClassSessionSchema = z.object({
  id: UUIDSchema,
  tenant_id: UUIDSchema,
  class_id: UUIDSchema,
  session_date: z.string().date('Invalid date format'),
  session_start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  session_end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  created_at: z.string().datetime(),
});

export type ClassSession = z.infer<typeof ClassSessionSchema>;

// Teacher profile
export const TeacherSchema = z.object({
  id: UUIDSchema,
  tenant_id: UUIDSchema,
  user_profile_id: UUIDSchema,
  name: z.string().min(1, 'Teacher name required'),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  contract_type: z.enum(['employee', 'contractor']).default('contractor'),
  hourly_rate_minor: z.number().nonnegative().nullable().optional(),
  created_at: z.string().datetime(),
});

export type Teacher = z.infer<typeof TeacherSchema>;
