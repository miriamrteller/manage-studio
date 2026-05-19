/// <reference types="vite/client" />
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/language-helper';
import type { TenantConfig } from '../types/auth';

/**
 * Resolves tenant from environment (dev) or subdomain (prod)
 * Fetches config from Supabase tenants table
 *
 * Dev: VITE_DEV_TENANT_SUBDOMAIN → queries by subdomain
 * Prod: window.location.hostname → extracts subdomain → queries by subdomain
 *
 * Returns: tenant config with language_default, computed locale
 * Direction is computed in useLanguage() hook, not here
 */
export function useTenant(): TenantConfig | null {
  // Determine subdomain
  const devSubdomain = import.meta.env.VITE_DEV_TENANT_SUBDOMAIN as
    | string
    | undefined;

  let subdomain: string | null = null;

  if (devSubdomain) {
    subdomain = devSubdomain;
  } else if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    if (parts.length > 1) {
      subdomain = parts[0];
    }
  }

  // Query Supabase for tenant config
  const { data: tenantConfig } = useQuery({
    queryKey: ['tenant', subdomain],
    queryFn: async () => {
      if (!subdomain) {
        return null;
      }

      const { data, error } = await supabase
        .from('tenant_config_by_subdomain')
        .select('*')
        .eq('tenant_subdomain', subdomain)
        .single();

      if (error) {
        console.warn('Failed to fetch tenant config:', error.message);
        return null;
      }

      // Construct white_label object from direct columns (no join needed)
      const whiteLabel = {
        primary_color: data.primary_color,
        accent_color: data.accent_color,
      };

      // Compute locale from language_default and country
      return {
        id: data.id,
        name: data.name,
        subdomain: data.tenant_subdomain,
        language: data.language_default,
        language_default: data.language_default,
        country: data.country,
        currency: data.currency,
        vat_rate: data.vat_rate,
        white_label: whiteLabel || undefined,
        locale: getLocale(data.language_default as 'he' | 'en', data.country as 'IL' | 'US'),
        stripe_publishable_key: data.stripe_publishable_key ?? null,
        stripe_secret_configured: Boolean(data.stripe_secret_configured),
        stripe_webhook_configured: Boolean(data.stripe_webhook_configured),
        stripe_credentials_updated_at: data.stripe_credentials_updated_at ?? null,
      } as TenantConfig;
    },
    enabled: !!subdomain,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  return tenantConfig || null;
}
