/// <reference types="vite/client" />
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { TenantConfig } from '../types/auth';

/**
 * Resolves tenant from environment (dev) or subdomain (prod)
 * Fetches full config from Supabase tenants table
 *
 * Dev: VITE_DEV_TENANT_SUBDOMAIN → queries by subdomain
 * Prod: window.location.hostname → extracts subdomain → queries by subdomain
 *
 * Returns: tenant config with locale, dir, colors, vat_rate for CSS/i18n
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
        .from('tenants')
        .select(
          'id, name, subdomain, locale, dir, primary_color, accent_color, currency, vat_rate'
        )
        .eq('subdomain', subdomain)
        .single();

      if (error) {
        console.warn('Failed to fetch tenant config:', error.message);
        return null;
      }

      return data as TenantConfig;
    },
    enabled: !!subdomain,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  return tenantConfig || null;
}
