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
 * Resolves tenant subdomain for multi-tenant routing and auth metadata.
 *
 * Prefer URL hostname subdomain when present (e.g. therapist.localhost).
 * Falls back to VITE_DEV_TENANT_SUBDOMAIN for plain localhost dev — DEV BUILDS ONLY.
 *
 * The dev fallback is deliberately gated on `import.meta.env.DEV`: if it ever shipped
 * to production, every unmatched host would silently serve one specific tenant's data.
 */
export function resolveTenantSubdomain(): string | null {
  const devSubdomain = import.meta.env.DEV
    ? (import.meta.env.VITE_DEV_TENANT_SUBDOMAIN as string | undefined)
    : undefined;

  if (typeof window === 'undefined') {
    return devSubdomain || null;
  }

  const hostname = window.location.hostname;
  const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  if (isIP) {
    return null;
  }

  // The apex itself (opalswift.com) and its www alias are the marketing site,
  // never a tenant. Without this, `opalswift.com` splits to a "opalswift" subdomain.
  const root = appRootHostname();
  if (hostname === root || hostname === `www.${root}`) {
    return devSubdomain || null;
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

  return subdomain || devSubdomain || null;
}
