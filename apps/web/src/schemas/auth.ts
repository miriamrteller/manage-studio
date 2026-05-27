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
