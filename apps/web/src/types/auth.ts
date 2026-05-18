/**
 * User profile from user_profiles table
 * Includes role array for multi-role support
 * Language and country are tenant-level settings (TenantConfig), not per-user overrides
 */
export type UserProfile = {
  id: string; // UUID from auth.users
  email: string;
  role: string[]; // e.g., ['parent'] or ['parent', 'teacher']
  person_id: string | null; // UUID if enrolled as student/parent
  tenant_id: string;
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
 * Used to apply branding, locale, language to app UI
 * Single source of truth: language_default is passed to useLanguage() hook
 * Direction is computed from language only (he → rtl, en → ltr)
 */
export type TenantConfig = {
  id: string;
  name: string;
  subdomain: string;
  language_default: 'he' | 'en'; // Renamed from language; source of truth
  country: 'IL' | 'US'; // For locale, phone parsing, not exposed in components
  currency: string; // e.g., 'ILS'
  vat_rate: number; // e.g., 0.17
  white_label?: TenantWhiteLabel; // Brand customization (colors, logo)
  // Computed (not stored in DB):
  locale: string; // Computed as e.g., 'he-IL', 'en-US'
  // NOTE: dir is never stored or passed; computed in useLanguage() hook only
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
