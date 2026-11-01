import type { TenantConfig } from '@/types/auth';

export interface LegalLinks {
  privacy: string | null;
  terms: string | null;
  accessibility: string | null;
}

function cleanUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Legal page URLs for the current site. On a tenant site only the tenant's own pages are
 * used (one studio's policy must never appear on another's site). The VITE_* env URLs are
 * for the OpalSwift root site (no tenant) only.
 */
export function resolveLegalLinks(
  tenant: Pick<TenantConfig, 'privacy_policy_url' | 'terms_url' | 'accessibility_url'> | null | undefined,
  env: { privacy?: string; terms?: string; accessibility?: string } = {
    privacy: import.meta.env.VITE_PRIVACY_POLICY_URL as string | undefined,
    terms: import.meta.env.VITE_TERMS_URL as string | undefined,
    accessibility: import.meta.env.VITE_ACCESSIBILITY_URL as string | undefined,
  },
): LegalLinks {
  if (tenant) {
    return {
      privacy: cleanUrl(tenant.privacy_policy_url),
      terms: cleanUrl(tenant.terms_url),
      accessibility: cleanUrl(tenant.accessibility_url),
    };
  }
  return {
    privacy: cleanUrl(env.privacy),
    terms: cleanUrl(env.terms),
    accessibility: cleanUrl(env.accessibility),
  };
}
