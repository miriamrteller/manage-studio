/// <reference types="vite/client" />
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/language-helper';
import { resolveTenantSubdomain } from '../lib/resolveTenantSubdomain';
import type { TenantConfig } from '../types/auth';
import { parseEntityLabelOverrides, resolveEntityLabels, resolvePresetModules, safePreset } from '@shared/index';

export function useTenant(): TenantConfig | null {
  return useTenantQuery().tenant;
}

/**
 * Tenant config plus its loading state, for callers that must distinguish
 * "still resolving" from "resolved to nothing" (e.g. route guards enforcing
 * tenant membership). Shares the query cache with useTenant().
 */
export function useTenantQuery(): { tenant: TenantConfig | null; isLoading: boolean } {
  const subdomain = resolveTenantSubdomain();
  const { data: tenantConfig, isLoading } = useQuery({
    queryKey: ['tenant', subdomain],
    queryFn: async () => {
      if (!subdomain) return null;
      const { data, error } = await supabase.rpc('get_tenant_config_by_subdomain', { p_subdomain: subdomain });
      if (error || !data || !Array.isArray(data) || data.length === 0) {
        console.warn('Failed to fetch tenant config:', error?.message || 'No data');
        return null;
      }
      const row = data[0];
      const whiteLabel = {
        primary_color: row.primary_color,
        accent_color: row.accent_color,
        logo_url: row.logo_url ?? undefined,
        logo_dark_url: row.logo_dark_url ?? undefined,
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
        currency: row.currency,        white_label: whiteLabel || undefined,
        locale: getLocale(row.language_default as 'he' | 'en', row.country as 'IL' | 'US'),
        stripe_publishable_key: row.payment_provider_public_key ?? row.stripe_publishable_key ?? null,
        stripe_secret_configured: Boolean(row.payment_provider_secret_configured ?? row.stripe_secret_configured),
        stripe_webhook_configured: Boolean(row.payment_provider_webhook_configured ?? row.stripe_webhook_configured),
        stripe_credentials_updated_at: row.payment_provider_updated_at ?? row.stripe_credentials_updated_at ?? null,
        payment_provider: row.payment_provider ?? 'grow',
        payment_provider_public_key: row.payment_provider_public_key ?? null,
        payment_provider_secret_configured: Boolean(row.payment_provider_secret_configured),
        payment_provider_webhook_configured: Boolean(row.payment_provider_webhook_configured),
        payment_provider_updated_at: row.payment_provider_updated_at ?? null,
        invoicing_provider: row.invoicing_provider ?? 'grow',
        business_preset: preset,
        entity_label_overrides: overrides,
        entity_labels: resolveEntityLabels(preset, overrides, 'en'),
        modules: resolvePresetModules(preset),
        enabled_features: Array.isArray(row.enabled_features) ? row.enabled_features : [],
        font_pair: row.font_pair ?? null,
        logo_url: row.logo_url ?? null,
        logo_dark_url: row.logo_dark_url ?? null,
      } as unknown as TenantConfig;
    },
    enabled: !!subdomain,
    staleTime: 30 * 60 * 1000,
  });
  return { tenant: tenantConfig || null, isLoading: !!subdomain && isLoading };
}
