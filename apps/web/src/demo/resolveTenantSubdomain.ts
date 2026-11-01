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

export type TenantSite = { kind: 'subdomain'; subdomain: string } | { kind: 'custom'; host: string };

export function resolveTenantSite(): TenantSite | null {
  return { kind: 'subdomain', subdomain: TENANT_SUBDOMAIN };
}

export function resolveTenantSiteFromHostname(): TenantSite | null {
  return resolveTenantSite();
}

export function rememberCustomHostSubdomain(): void {}

/** The demo always runs as one studio, never on the platform app host. */
export function isPlatformAppHostname(): boolean {
  return false;
}

export function isPlatformAppHost(): boolean {
  return false;
}
