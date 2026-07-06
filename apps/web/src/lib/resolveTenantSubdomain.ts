/// <reference types="vite/client" />

const RESERVED_SUBDOMAINS = new Set(['localhost', 'www', '127', '0']);

/**
 * Resolves tenant subdomain for multi-tenant routing and auth metadata.
 *
 * Prefer URL hostname subdomain when present (e.g. therapist.localhost).
 * Fallback to VITE_DEV_TENANT_SUBDOMAIN for plain localhost dev.
 */
export function resolveTenantSubdomain(): string | null {
  const devSubdomain = import.meta.env.VITE_DEV_TENANT_SUBDOMAIN as string | undefined;

  if (typeof window === 'undefined') {
    return devSubdomain || null;
  }

  const hostname = window.location.hostname;
  const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  if (isIP) {
    return null;
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
