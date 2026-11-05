/// <reference types="vite/client" />

import { appRootHostname } from './tenantUrl';
import { DEV_PLATFORM_CHOICE, isDevPickerActive, readDevStudioChoice } from './devStudioPicker';

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

/** What the current hostname identifies. */
export type TenantSite =
  | { kind: 'subdomain'; subdomain: string }
  /** A host outside the root domain, e.g. app.creativeballetacademy.com (tenants.custom_domain). */
  | { kind: 'custom'; host: string };

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  );
}

/**
 * Pure hostname → site resolution.
 *
 * Hosts under the root domain (and local dev hosts) resolve exactly as before, by
 * subdomain. Any other non-local host is treated as a studio's custom domain and looked
 * up by host (get_tenant_config_by_host). Never the reverse: a host under the root domain
 * is never looked up as a custom domain.
 */
export function resolveTenantSiteFromHostname(
  hostname: string,
  rootHostname: string,
  devFallback: string | null,
): TenantSite | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  const underRoot = host === rootHostname || host.endsWith(`.${rootHostname}`);
  if (underRoot || isLocalHostname(host) || isLocalHostname(rootHostname)) {
    const subdomain = resolveTenantSubdomainFromHostname(host, rootHostname, devFallback);
    return subdomain ? { kind: 'subdomain', subdomain } : null;
  }
  return host ? { kind: 'custom', host } : null;
}

export function resolveTenantSite(): TenantSite | null {
  const devFallback = devTenantFallback();
  if (typeof window === 'undefined') {
    return devFallback ? { kind: 'subdomain', subdomain: devFallback } : null;
  }
  if (isDevPickerActive()) {
    // Dev website: one address for every test studio, picked from a list (devStudioPicker.ts).
    const choice = readDevStudioChoice();
    return choice && choice !== DEV_PLATFORM_CHOICE ? { kind: 'subdomain', subdomain: choice } : null;
  }
  return resolveTenantSiteFromHostname(window.location.hostname, appRootHostname(), devFallback);
}

/**
 * On a custom domain the subdomain is only known once the tenant config has loaded
 * (useTenant). Callers that send the subdomain to the API (login metadata, public
 * offerings) read it back from here.
 */
const customHostSubdomains = new Map<string, string>();

export function rememberCustomHostSubdomain(host: string, subdomain: string): void {
  customHostSubdomains.set(host.trim().toLowerCase(), subdomain);
}

/**
 * Resolves tenant subdomain for multi-tenant routing and auth metadata.
 *
 * Prefers the URL hostname subdomain (e.g. creativeballet.opalswift.com), falling
 * back to VITE_DEV_TENANT_SUBDOMAIN on plain localhost in dev builds only. On a
 * studio's custom domain it returns the subdomain of the tenant loaded for that
 * host, or null until the tenant config has loaded.
 */
export function resolveTenantSubdomain(): string | null {
  const site = resolveTenantSite();
  if (!site) return null;
  if (site.kind === 'subdomain') return site.subdomain;
  return customHostSubdomains.get(site.host) ?? null;
}

/**
 * The tenant-less OpalSwift app host: `app.<root>` (app.opalswift.com, app.localhost in dev).
 * Its root path shows OpalSwift's welcome page instead of a studio page.
 */
export function isPlatformAppHostname(hostname: string, rootHostname: string): boolean {
  return hostname.trim().toLowerCase().replace(/\.$/, '') === `app.${rootHostname}`;
}

export function isPlatformAppHost(): boolean {
  if (typeof window === 'undefined') return false;
  if (isDevPickerActive()) {
    return readDevStudioChoice() === DEV_PLATFORM_CHOICE;
  }
  return isPlatformAppHostname(window.location.hostname, appRootHostname());
}
