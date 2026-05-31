/**
 * Centralized schema exports for the web app
 * Re-exports shared schemas + defines web-specific validation schemas
 */

// Re-export from shared package
export {
  LoginFormSchema,
  PasswordLoginSchema,
  PublicOfferingSchema,
  UUIDSchema,
  EmailSchema,
  PhoneSchema,
  CurrencySchema,
  DateSchema,
  TenantSchema,
  UserProfileSchema,
  PersonSchema,
  ContactPreferencesSchema,
  AccountSchema,
  AccountMemberSchema,
  SeasonSchema,
  CategorySchema,
  OfferingSchema,
  OfferingRequirementSchema,
  EngagementSchema,
  type LoginForm,
  type PasswordLogin,
  type PublicOffering,
  type Tenant,
  type UserProfile,
  type Person,
  type ContactPreferences,
  type Account,
  type AccountMember,
  type Season,
  type Category,
  type Offering,
  type OfferingRequirement,
  type Engagement,
} from '@shared/schemas';

// Re-export from feature-specific files
export {
  signupFormSchema,
  loginEmailOtpVerifySchema,
  type SignupForm,
  type LoginEmailOtpVerify,
} from './auth';
export { signupFormSchema as SignupFormSchema } from './auth';
