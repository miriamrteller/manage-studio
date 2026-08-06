export type TenantWhiteLabel = {
  primary_color: string;
  secondary_color?: string;
  accent_color?: string;
  logo?: { url: string; height?: string };
  logo_dark?: { url: string; height?: string };
  logo_url?: string;
  logo_dark_url?: string;
};

export type TenantConfig = {
  id: string;
  name: string;
  subdomain: string;
  language: 'he' | 'en';
  language_default?: 'he' | 'en';
  country: 'IL' | 'US';
  currency: string;  white_label?: TenantWhiteLabel;
  locale: string;
  stripe_publishable_key?: string | null;
  stripe_secret_configured?: boolean;
  stripe_webhook_configured?: boolean;
  stripe_credentials_updated_at?: string | null;
  payment_provider: string;
  payment_provider_public_key?: string | null;
  payment_provider_secret_configured?: boolean;
  payment_provider_webhook_configured?: boolean;
  payment_provider_updated_at?: string | null;
  invoicing_provider: string;
  business_preset: string;
  entity_label_overrides?: Record<string, Record<string, string>>;
  entity_labels?: Record<string, string>;
  modules?: string[];
  enabled_features?: string[];
  font_pair?: string | null;
  logo_url?: string | null;
  logo_dark_url?: string | null;
};

export type User = {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role: 'owner' | 'admin' | 'staff' | 'instructor';
  tenant_id: string;
  created_at: string;
  updated_at: string;
};

export type UserProfile = {
  id: string;
  email?: string;
  full_name?: string;
  avatar_url?: string;
  role: string[];
  language?: 'he' | 'en';
  tenant_id?: string;
  person_id?: string;
  created_at?: string;
  updated_at?: string;
};

export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: User;
};

export type AuthState = {
  user: User | null;
  session: Session | null;
  tenant: TenantConfig | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type RegisterCredentials = {
  email: string;
  password: string;
  full_name: string;
  tenant_subdomain?: string;
};

export type PasswordResetRequest = {
  email: string;
};

export type PasswordUpdateRequest = {
  password: string;
};
