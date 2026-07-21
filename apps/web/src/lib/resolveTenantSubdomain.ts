/// <reference types="vite/client" />

import { appRootHostname } from './tenantUrl';

/**
 * Hostnames that never identify a tenant.
 *
 * `www`/`app`/`api`/... are infrastructure names: `app.opalswift.com` serves the
 * tenant-less shell (signup, post-payment onboarding, session handoff), so it must
 * resolve to null rather than looking up a tenant called "app".
 *
 * Keep in sync with `is_reserved_subdomain()` in the database, which enforces the
 * same list at provisioning time.
 */
const RESERVED_SUBDOMAINS = new Set([
  'localhost',
  '127',
  '0',
  'www',
  'app',
  'api',
  'admin',
  'auth',
  'mail',
  'static',
  'assets',
  'cdn',
]);

/**
 * Dev-only tenant fallback for plain `localhost` (no subdomain in the host).
 *
 * `import.meta.env.DEV` is replaced with a literal at build time, so this branch is
 * dead-code-eliminated from production bundles — the fallback cannot leak to prod
 * even if VITE_DEV_TENANT_SUBDOMAIN is set on the build. That matters: if it were
 * honoured in prod, every unmatched host would silently serve one tenant's data.
 */
function devTenantFallback(): string | null {
  if (!import.meta.env.DEV) return null;
  return (import.meta.env.VITE_DEV_TENANT_SUBDOMAIN as string | undefined)?.trim() || null;
}

/**
 * Pure hostname → tenant resolution.
 *
 * Exported for tests: the build-time DEV gate above cannot be toggled at runtime
 * (`vi.stubEnv('DEV', …)` has no effect on a statically replaced literal), so
 * production behaviour is exercised by passing `devFallback: null` here.
 */
export function resolveTenantSubdomainFromHostname(
  hostname: string,
  rootHostname: string,
  devFallback: string | null,
): string | null {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }

  // The apex (opalswift.com) and its www alias are the marketing site, never a
  // tenant. Without this, `opalswift.com` splits to an "opalswift" subdomain.
  if (hostname === rootHostname || hostname === `www.${rootHostname}`) {
    return devFallback;
  }

  const parts = hostname.split('.');
  let subdomain: string | null = null;

  if (parts.length > 2) {
    subdomain = parts[0];
  } else if (parts.length === 2 && parts[0] !== 'localhost') {
    // e.g. creativeballet.localhost
    subdomain = parts[0];
  }

  if (subdomain && RESERVED_SUBDOMAINS.has(subdomain)) {
    subdomain = null;
  }

  return subdomain || devFallback;
}

/**
 * Resolves tenant subdomain for multi-tenant routing and auth metadata.
 *
 * Prefers the URL hostname subdomain (e.g. creativeballet.opalswift.com), falling
 * back to VITE_DEV_TENANT_SUBDOMAIN on plain localhost in dev builds only.
 */
export function resolveTenantSubdomain(): string | null {
  const devFallback = devTenantFallback();

  if (typeof window === 'undefined') {
    return devFallback;
  }

  return resolveTenantSubdomainFromHostname(
    window.location.hostname,
    appRootHostname(),
    devFallback,
  );
}
