import { z } from 'zod';
import { EmailSchema } from '@shared/schemas';

/**
 * Auth-specific validation schemas
 * These are web-app specific and not part of the shared package
 */

/**
 * Signup form validation
 * Extends login with password confirmation
 */
export const signupFormSchema = z.object({
  email: EmailSchema,
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
  channel: z.enum(['email', 'sms', 'whatsapp']).default('email'),
}).refine((data) => {
  // phone is required if channel is sms or whatsapp
  if ((data.channel === 'sms' || data.channel === 'whatsapp') && !data.phone) {
    return false;
  }
  return true;
}, {
  message: 'Phone number is required for SMS and WhatsApp',
  path: ['phone'],
});

export type SignupForm = z.infer<typeof signupFormSchema>;

/** Login email OTP verify step — email + numeric code from Supabase Auth mailer */
export const loginEmailOtpVerifySchema = z.object({
  email: EmailSchema,
  code: z
    .string()
    .regex(/^\d{6,8}$/, 'Enter the code from your email (6–8 digits)'),
});

export type LoginEmailOtpVerify = z.infer<typeof loginEmailOtpVerifySchema>;

type TranslateFn = (key: string) => string;

export function createSetPasswordFormSchema(t: TranslateFn, requiresCurrentPassword: boolean) {
  const passwordField = z
    .string()
    .min(6, t('pages.portal.password.error_min'))
    .regex(/[A-Z]/, t('pages.portal.password.error_uppercase'))
    .regex(/[0-9]/, t('pages.portal.password.error_number'));

  return z
    .object({
      currentPassword: requiresCurrentPassword
        ? z.string().min(1, t('pages.portal.password.error_current_required'))
        : z.string().optional(),
      password: passwordField,
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('pages.portal.password.error_mismatch'),
      path: ['confirmPassword'],
    });
}

export type SetPasswordForm = z.infer<ReturnType<typeof createSetPasswordFormSchema>>;
