/**
 * Demo replacement for src/lib/resolveTenantSubdomain.ts: the demo runs under
 * an artifact URL, so the photographer tenant is fixed instead of read from
 * the hostname.
 */
import { TENANT_SUBDOMAIN } from './seed';

export function resolveTenantSubdomainFromHostname(): string | null {
  return TENANT_SUBDOMAIN;
}

export function resolveTenantSubdomain(): string | null {
  return TENANT_SUBDOMAIN;
}
