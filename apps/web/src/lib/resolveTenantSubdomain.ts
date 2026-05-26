/// <reference types="vite/client" />

const RESERVED_SUBDOMAINS = new Set(['localhost', 'www', '127', '0']);

/**
 * Resolves tenant subdomain for multi-tenant routing and auth metadata.
 *
 * Dev: VITE_DEV_TENANT_SUBDOMAIN
 * Prod: first label of hostname (excluding IPs and reserved names)
 */
export function resolveTenantSubdomain(): string | null {
  const devSubdomain = import.meta.env.VITE_DEV_TENANT_SUBDOMAIN as string | undefined;

  if (devSubdomain) {
    return devSubdomain;
  }

  if (typeof window === 'undefined') {
    return null;
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
    return null;
  }

  return subdomain;
}
