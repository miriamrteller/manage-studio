/**
 * Centralized schema exports for the web app
 * Re-exports shared schemas + defines web-specific validation schemas
 */

// Re-export from shared package
export {
  LoginFormSchema,
  PublicClassSchema,
  UUIDSchema,
  EmailSchema,
  PhoneSchema,
  CurrencySchema,
  DateSchema,
  TenantSchema,
  UserProfileSchema,
  PersonSchema,
  ContactPreferencesSchema,
  type LoginForm,
  type PublicClass,
  type Tenant,
  type UserProfile,
  type Person,
  type ContactPreferences,
} from '@shared/schemas';

// Re-export from feature-specific files
export { signupFormSchema, type SignupForm } from './auth';
export { signupFormSchema as SignupFormSchema } from './auth';
