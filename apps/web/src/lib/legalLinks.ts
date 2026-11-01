/**
 * Legal links for the current site: the studio's own pages first (tenants.*_url),
 * then the platform's (VITE_*), else null. Every studio has its own privacy policy
 * and terms (docs/legal 03, 06, 07a/07c), so one platform URL is only a fallback.
 */
export interface LegalLinks {
  privacy: string | null;
  terms: string | null;
  accessibility: string | null;
}

interface TenantLegalFields {
  privacy_policy_url?: string | null;
  terms_url?: string | null;
  accessibility_statement_url?: string | null;
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^https?:\/\/\S+$/.test(trimmed) ? trimmed : null;
}

export function resolveLegalLinks(
  tenant: TenantLegalFields | null | undefined,
  env: Record<string, unknown> = import.meta.env,
): LegalLinks {
  return {
    privacy: clean(tenant?.privacy_policy_url) ?? clean(env.VITE_PRIVACY_POLICY_URL),
    terms: clean(tenant?.terms_url) ?? clean(env.VITE_TERMS_URL),
    accessibility:
      clean(tenant?.accessibility_statement_url) ?? clean(env.VITE_ACCESSIBILITY_STATEMENT_URL),
  };
}
