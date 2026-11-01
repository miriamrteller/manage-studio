/**
 * Legal links for the current site, in priority order:
 *   1. the studio's own pages (tenants.*_url, set in Settings → Legal);
 *   2. the studio's in-app pages generated from its legal details (/legal/…),
 *      once published;
 *   3. on the OpalSwift root site only, the platform's pages (VITE_*).
 * A studio's privacy policy and terms are its own (docs/legal 03, 07a/07c), so
 * a studio never falls back to OpalSwift's privacy policy or terms.
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

/** The studio's generated pages (see legal/useLegalDocument). */
export interface InAppLegalPages {
  published: boolean;
  hasTerms: boolean;
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^https?:\/\/\S+$/.test(trimmed) ? trimmed : null;
}

export function resolveLegalLinks(
  tenant: TenantLegalFields | null | undefined,
  env: Record<string, unknown> = import.meta.env,
  inApp?: InAppLegalPages | null,
): LegalLinks {
  if (!tenant) {
    return {
      privacy: clean(env.VITE_PRIVACY_POLICY_URL),
      terms: clean(env.VITE_TERMS_URL),
      accessibility: clean(env.VITE_ACCESSIBILITY_STATEMENT_URL),
    };
  }
  return {
    privacy: clean(tenant.privacy_policy_url) ?? (inApp?.published ? '/legal/studio-privacy' : null),
    terms:
      clean(tenant.terms_url) ?? (inApp?.published && inApp.hasTerms ? '/legal/enrolment-terms' : null),
    accessibility:
      clean(tenant.accessibility_statement_url) ??
      (inApp ? '/legal/accessibility' : clean(env.VITE_ACCESSIBILITY_STATEMENT_URL)),
  };
}

export function isInternalLegalLink(href: string): boolean {
  return href.startsWith('/');
}
