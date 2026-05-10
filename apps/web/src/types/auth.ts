/**
 * User profile from user_profiles table
 * Includes role array for multi-role support
 */
export type UserProfile = {
  id: string; // UUID from auth.users
  email: string;
  role: string[]; // e.g., ['parent'] or ['parent', 'teacher']
  person_id: string | null; // UUID if enrolled as student/parent
  tenant_id: string;
  created_at: string;
};

/**
 * Tenant configuration from tenants table
 * Used to apply branding, locale, dir to app UI
 */
export type TenantConfig = {
  id: string;
  name: string;
  subdomain: string;
  locale: string; // e.g., 'he-IL'
  dir: 'rtl' | 'ltr';
  primary_color: string; // e.g., '#76335a'
  accent_color: string; // e.g., '#e99ac4'
  currency: string; // e.g., 'ILS'
  vat_rate: number; // e.g., 0.17
};

/**
 * Public class from classes table (for landing page)
 */
export type PublicClass = {
  id: string;
  tenant_id: string;
  name: string;
  level_id: string | null;
  start_time: string; // e.g., '18:30'
  end_time: string;
  price_minor: number; // in agorot (1/100 ILS)
  max_capacity: number;
  current_enrolments?: number;
};
