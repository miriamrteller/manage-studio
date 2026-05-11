/**
 * User profile from user_profiles table
 * Includes role array for multi-role support
 * language and country are optional overrides (NULL = use tenant defaults)
 */
export type UserProfile = {
  id: string; // UUID from auth.users
  email: string;
  role: string[]; // e.g., ['parent'] or ['parent', 'teacher']
  person_id: string | null; // UUID if enrolled as student/parent
  tenant_id: string;
  language?: 'he' | 'en' | null; // User's language preference (overrides tenant)
  country?: 'IL' | 'US' | null; // User's country preference (overrides tenant)
  created_at: string;
};

/**
 * Tenant white-label configuration
 * Stores brand customization: primary color, secondary color, logo
 */
export type TenantWhiteLabel = {
  primary_color: string; // e.g., '#76335a'
  secondary_color?: string; // e.g., '#e99ac4' (optional)
  accent_color?: string; // e.g., '#a78bfa' (optional)
  logo?: {
    url: string;
    height?: string;
  };
  logo_dark?: {
    url: string;
    height?: string;
  };
};

/**
 * Tenant configuration from tenants table
 * Used to apply branding, locale, dir to app UI
 * language + country are sources of truth; dir and locale are computed
 */
export type TenantConfig = {
  id: string;
  name: string;
  subdomain: string;
  language: 'he' | 'en'; // Source of truth for language
  country: 'IL' | 'US'; // Source of truth for region (VAT, currency, locale)
  currency: string; // e.g., 'ILS'
  vat_rate: number; // e.g., 0.17
  white_label?: TenantWhiteLabel; // Brand customization (colors, logo)
  // Computed (not stored in DB):
  dir?: 'rtl' | 'ltr'; // Computed from language
  locale?: string; // Computed as e.g., 'he-IL'
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
