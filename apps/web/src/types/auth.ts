import type { BusinessPreset, EntityLabels, PresetModules } from '@shared/index';

/**
 * User profile from user_profiles table
 * Includes role array for multi-role support
 * Language and country are tenant-level settings (TenantConfig), not per-user overrides
 */
export type UserProfile = {
  id: string;
  email: string;
  role: string[];
  person_id: string | null;
  tenant_id: string;
  language: 'he' | 'en' | null;
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
  language: 'he' | 'en';
  language_default: 'he' | 'en';
  country: 'IL' | 'US';
  currency: string;
  vat_rate: number;
  prices_include_vat: boolean;
  white_label?: TenantWhiteLabel;
  locale: string;
  stripe_publishable_key?: string | null;
  stripe_secret_configured?: boolean;
  stripe_webhook_configured?: boolean;
  stripe_credentials_updated_at?: string | null;
  payment_provider?: string;
  payment_provider_public_key?: string | null;
  payment_provider_secret_configured?: boolean;
  payment_provider_webhook_configured?: boolean;
  payment_provider_updated_at?: string | null;
  invoicing_provider?: string;
  business_preset: BusinessPreset;
  /** Tenant-specific label overrides (raw); resolve with UI language via resolveEntityLabels. */
  entity_label_overrides: Partial<EntityLabels>;
  entity_labels: EntityLabels;
  modules: PresetModules;
  /** Feature keys enabled for this tenant (anon-safe, from get_tenant_config_by_subdomain). */
  enabled_features: string[];
};

/**
 * Public class from classes table (for landing page)
 */
export type PublicOffering = {
  id: string;
  tenant_id: string;
  name: string;
  category_id: string | null;
  start_time: string; // e.g., '18:30'
  end_time: string;
  price_minor: number; // in agorot (1/100 ILS)
  max_capacity: number;
  current_enrolments?: number;
};
