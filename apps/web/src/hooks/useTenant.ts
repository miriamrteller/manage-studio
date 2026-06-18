/// <reference types="vite/client" />
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/language-helper';
import { resolveTenantSubdomain } from '../lib/resolveTenantSubdomain';
import type { TenantConfig } from '../types/auth';
import {
  parseEntityLabelOverrides,
  resolveEntityLabels,
  resolvePresetModules,
  safePreset,
} from '@shared/index';

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
  const subdomain = resolveTenantSubdomain();

  if (typeof window !== 'undefined') {
    // Log for debugging
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

      const preset = safePreset(row.business_preset);
      const overrides = parseEntityLabelOverrides(row.labels);

      return {
        id: row.id,
        name: row.name,
        subdomain: row.tenant_subdomain,
        language: row.language_default,
        language_default: row.language_default,
        country: row.country,
        currency: row.currency,
        vat_rate: Number(row.vat_rate ?? 0.17),
        prices_include_vat: row.prices_include_vat !== false,
        white_label: whiteLabel || undefined,
        locale: getLocale(row.language_default as 'he' | 'en', row.country as 'IL' | 'US'),
        stripe_publishable_key: row.payment_provider_public_key ?? row.stripe_publishable_key ?? null,
        stripe_secret_configured: Boolean(row.payment_provider_secret_configured ?? row.stripe_secret_configured),
        stripe_webhook_configured: Boolean(row.payment_provider_webhook_configured ?? row.stripe_webhook_configured),
        stripe_credentials_updated_at: row.payment_provider_updated_at ?? row.stripe_credentials_updated_at ?? null,
        payment_provider: row.payment_provider ?? 'stripe',
        payment_provider_public_key: row.payment_provider_public_key ?? null,
        payment_provider_secret_configured: Boolean(row.payment_provider_secret_configured),
        payment_provider_webhook_configured: Boolean(row.payment_provider_webhook_configured),
        payment_provider_updated_at: row.payment_provider_updated_at ?? null,
        invoicing_provider: row.invoicing_provider ?? 'green_invoice',
        business_preset: preset,
        entity_labels: resolveEntityLabels(preset, overrides),
        modules: resolvePresetModules(preset),
      } as TenantConfig;
    },
    enabled: !!subdomain,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  return tenantConfig || null;
}
