/// <reference types="vite/client" />

/**
 * Root domain that tenant subdomains hang off — e.g. `opalswift.com`, so a tenant
 * lives at `creativeballet.opalswift.com`.
 *
 * Local dev falls back to `localhost:5173`, which makes `creativeballet.localhost:5173`
 * work without extra config. Set `VITE_APP_ROOT_DOMAIN` on the production build.
 *
 * NOTE: VITE_* vars are inlined at build time — changing this needs a rebuild,
 * not just a redeploy.
 */
export function appRootDomain(): string {
  const configured = (import.meta.env.VITE_APP_ROOT_DOMAIN as string | undefined)?.trim();
  return configured || 'localhost:5173';
}

/** Root domain without any port, for hostname comparisons. */
export function appRootHostname(): string {
  return appRootDomain().split(':')[0];
}

/**
 * Absolute origin for a tenant, e.g. `https://creativeballet.opalswift.com`.
 * Uses http only for local dev hosts so cross-subdomain redirects stay TLS in prod.
 */
export function tenantOrigin(subdomain: string): string {
  const root = appRootDomain();
  const isLocal = appRootHostname() === 'localhost' || appRootHostname().endsWith('.localhost');
  return `${isLocal ? 'http' : 'https'}://${subdomain}.${root}`;
}
