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
  // Determine subdomain (robust)
  const devSubdomain = import.meta.env.VITE_DEV_TENANT_SUBDOMAIN as string | undefined;

  let subdomain: string | null = null;

  if (devSubdomain) {
    subdomain = devSubdomain;
  } else if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // Check for IP address
    const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    if (!isIP) {
      const parts = hostname.split('.');
      if (parts.length > 2) {
        subdomain = parts[0];
      } else if (parts.length === 2 && parts[0] !== 'localhost') {
        // e.g. dev with custom hosts like 'creativeballet.localhost'
        subdomain = parts[0];
      }
      // Exclude reserved words
      if (subdomain && ['localhost', 'www', '127', '0'].includes(subdomain)) {
        subdomain = null;
      }
    }
  }

  if (typeof window !== 'undefined') {
    // Log for debugging
    // eslint-disable-next-line no-console
    console.debug('Resolved tenant subdomain:', subdomain);
  }

  // Query Supabase for tenant config using RPC (function, not table)
  // This matches the DB schema and avoids 404s on non-existent views/tables.
  const { data: tenantConfig } = useQuery({
    queryKey: ['tenant', subdomain],
    queryFn: async () => {
      if (!subdomain) {
        return null;
      }

      const { data, error } = await supabase
        .rpc('get_tenant_config_by_subdomain', { p_subdomain: subdomain });

      if (error || !data || !Array.isArray(data) || data.length === 0) {
        console.warn('Failed to fetch tenant config:', error?.message || 'No data');
        return null;
      }

      const row = data[0];
      const whiteLabel = {
        primary_color: row.primary_color,
        accent_color: row.accent_color,
      };

      return {
        id: row.id,
        name: row.name,
        subdomain: row.tenant_subdomain,
        language: row.language_default,
        language_default: row.language_default,
        country: row.country,
        currency: row.currency,
        vat_rate: row.vat_rate,
        white_label: whiteLabel || undefined,
        locale: getLocale(row.language_default as 'he' | 'en', row.country as 'IL' | 'US'),
        stripe_publishable_key: row.stripe_publishable_key ?? null,
        stripe_secret_configured: Boolean(row.stripe_secret_configured),
        stripe_webhook_configured: Boolean(row.stripe_webhook_configured),
        stripe_credentials_updated_at: row.stripe_credentials_updated_at ?? null,
      } as TenantConfig;
    },
    enabled: !!subdomain,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  return tenantConfig || null;
}
