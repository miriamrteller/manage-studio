/**
 * Centralized schema exports for the web app
 * Re-exports shared schemas + defines web-specific validation schemas
 */

// Re-export from shared package
export {
  LoginFormSchema,
  PasswordLoginSchema,
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
  FamilySchema,
  FamilyMemberSchema,
  TermSchema,
  LevelSchema,
  ClassSchema,
  ClassRequirementSchema,
  EnrolmentSchema,
  type LoginForm,
  type PasswordLogin,
  type PublicClass,
  type Tenant,
  type UserProfile,
  type Person,
  type ContactPreferences,
  type Family,
  type FamilyMember,
  type Term,
  type Level,
  type Class,
  type ClassRequirement,
  type Enrolment,
} from '@shared/schemas';

// Re-export from feature-specific files
export {
  signupFormSchema,
  loginEmailOtpVerifySchema,
  type SignupForm,
  type LoginEmailOtpVerify,
} from './auth';
export { signupFormSchema as SignupFormSchema } from './auth';
