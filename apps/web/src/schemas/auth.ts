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
});

export type SignupForm = z.infer<typeof signupFormSchema>;
