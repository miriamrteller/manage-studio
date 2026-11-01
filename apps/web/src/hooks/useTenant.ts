/// <reference types="vite/client" />
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/language-helper';
import { rememberCustomHostSubdomain, resolveTenantSite } from '../lib/resolveTenantSubdomain';
import type { TenantConfig } from '../types/auth';
import { parseLogoTone } from '../lib/theme/logoTone';
import { parseEntityLabelOverrides, resolveEntityLabels, resolvePresetModules, safePreset, safeVertical } from '@shared/index';

export function useTenant(): TenantConfig | null {
  return useTenantQuery().tenant;
}

/**
 * Tenant config plus its loading state, for callers that must distinguish
 * "still resolving" from "resolved to nothing" (e.g. route guards enforcing
 * tenant membership). Shares the query cache with useTenant().
 */
export function useTenantQuery(): {
  tenant: TenantConfig | null;
  isLoading: boolean;
  /** The lookup finished and no studio exists for this host (not set on a lookup error). */
  notFound: boolean;
} {
  const site = resolveTenantSite();
  const siteKey = site ? (site.kind === 'subdomain' ? site.subdomain : `host:${site.host}`) : null;
  const { data: tenantConfig, isLoading, isSuccess } = useQuery({
    queryKey: ['tenant', siteKey],
    queryFn: async () => {
      if (!site) return null;
      // Custom domain (e.g. app.creativeballetacademy.com) → look up by host; otherwise by subdomain.
      const { data, error } =
        site.kind === 'custom'
          ? await supabase.rpc('get_tenant_config_by_host', { p_host: site.host })
          : await supabase.rpc('get_tenant_config_by_subdomain', { p_subdomain: site.subdomain });
      // A failed lookup is an error, not "no studio here", so it never shows the
      // not-found page. Only an empty result means the host has no studio.
      if (error) throw new Error(`Failed to fetch tenant config: ${error.message}`);
      if (!data || !Array.isArray(data) || data.length === 0) return null;
      const row = data[0];
      if (site.kind === 'custom' && row.tenant_subdomain) {
        rememberCustomHostSubdomain(site.host, row.tenant_subdomain);
      }
      const whiteLabel = {
        primary_color: row.primary_color,
        accent_color: row.accent_color,
        logo_url: row.logo_url ?? undefined,
        logo_dark_url: row.logo_dark_url ?? undefined,
      };
      const preset = safePreset(row.business_preset);
      const overrides = parseEntityLabelOverrides(row.labels);
      const vertical = safeVertical(row.skin);
      return {
        id: row.id,
        name: row.name,
        subdomain: row.tenant_subdomain,
        language: row.language_default,
        language_default: row.language_default,
        country: row.country,
        currency: row.currency,
        white_label: whiteLabel || undefined,
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
        vertical,
        entity_label_overrides: overrides,
        entity_labels: resolveEntityLabels(preset, overrides, 'en', vertical),
        modules: resolvePresetModules(preset),
        enabled_features: Array.isArray(row.enabled_features) ? row.enabled_features : [],
        font_pair: row.font_pair ?? null,
        logo_url: row.logo_url ?? null,
        logo_dark_url: row.logo_dark_url ?? null,
        chrome_style: row.chrome_style === 'solid' ? 'solid' : 'soft',
        logo_tone: parseLogoTone(row.logo_tone),
        logo_dark_tone: parseLogoTone(row.logo_dark_tone),
        logo_autofix: row.logo_autofix !== false,
        privacy_policy_url: row.privacy_policy_url ?? null,
        terms_url: row.terms_url ?? null,
        accessibility_statement_url: row.accessibility_statement_url ?? null,
        offline_payment_instructions: row.offline_payment_instructions ?? null,
      } as unknown as TenantConfig;
    },
    enabled: !!site,
    staleTime: 30 * 60 * 1000,
  });
  return {
    tenant: tenantConfig || null,
    isLoading: !!site && isLoading,
    notFound: !!site && isSuccess && tenantConfig === null,
  };
}
