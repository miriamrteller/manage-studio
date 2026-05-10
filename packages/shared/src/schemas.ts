import { z } from 'zod'

/**
 * Zod schemas for type-safe validation
 * Use on all external data: API responses, form inputs, webhooks
 */

export const UUIDSchema = z.string().uuid()

export const EmailSchema = z.string().email('Invalid email address')

export const PhoneSchema = z.string().regex(
  /^\+972\d{9}$/,
  'Must be a valid Israeli phone number'
)

export const CurrencySchema = z.number().int().positive('Amount must be positive')

export const DateSchema = z.string().date('Invalid date format')

// Example: Tenant schema
export const TenantSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1),
  subdomain: z.string().min(1),
  locale: z.string().default('he-IL'),
  dir: z.enum(['rtl', 'ltr']).default('rtl'),
  currency: z.string().default('ILS'),
  vat_rate: z.number().default(0.17),
})

export type Tenant = z.infer<typeof TenantSchema>

export const UserSchema = z.object({
  id: UUIDSchema,
  email: EmailSchema,
  tenant_id: UUIDSchema,
  role: z.enum(['admin', 'teacher', 'parent', 'student']).optional(),
}).nullable()

export type User = z.infer<typeof UserSchema>
