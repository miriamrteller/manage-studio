/**
 * Tenant-facing base URL.
 *
 * APP_URL is a single platform-wide value, so building a tenant's links from it
 * only works while exactly one tenant exists. With APP_URL set to
 * https://creativeballet.opalswift.com — as the go-live plan instructs — a
 * second studio's parents would receive booking and waiver links pointing at
 * Creative Ballet's site. The waiver token itself carries `tid` and is rejected
 * on mismatch, so the link would land on the wrong studio and then fail.
 *
 * Tenant-specific values belong in the database. The subdomain already lives on
 * `tenants.subdomain`; the only platform-wide part is the root domain.
 *
 * Genuinely platform-level URLs must NOT use this: the Google OAuth redirect_uri
 * has to match the single URI registered with Google, so those keep APP_URL.
 */
import { getEnv } from "./edge-runtime/env.ts";

/**
 * Root domain shared by every tenant, e.g. "opalswift.com".
 * Falls back to deriving from APP_URL so existing single-tenant deployments keep
 * working, but prefer setting it explicitly.
 */
export function appRootDomain(): string {
  const explicit = getEnv("APP_ROOT_DOMAIN")?.trim();
  if (explicit) return explicit.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const appUrl = getEnv("APP_URL")?.trim();
  if (!appUrl) {
    throw new Error(
      "APP_ROOT_DOMAIN is not configured (e.g. opalswift.com) and APP_URL is unset — " +
        "cannot build tenant links.",
    );
  }
  const host = appUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  // Strip a leading subdomain label so a legacy APP_URL of
  // creativeballet.opalswift.com still yields opalswift.com.
  const parts = host.split(".");
  return parts.length > 2 ? parts.slice(1).join(".") : host;
}

/**
 * Base URL for a specific tenant, e.g. https://creativeballet.opalswift.com.
 * No trailing slash — callers append their own path.
 */
export function tenantBaseUrl(subdomain: string | null | undefined): string {
  const sub = subdomain?.trim().toLowerCase();
  if (!sub) {
    throw new Error("Cannot build a tenant URL without a subdomain.");
  }
  const root = appRootDomain();
  // localhost keeps its port and gains no subdomain — dev runs a single tenant
  // resolved via VITE_DEV_TENANT_SUBDOMAIN, not via the hostname.
  if (root.startsWith("localhost") || root.startsWith("127.0.0.1")) {
    return `http://${root}`;
  }
  return `https://${sub}.${root}`;
}

/**
 * The PLATFORM's own origin. Exactly one thing may use this: an OAuth
 * redirect_uri.
 *
 * It is NOT a pattern and cannot contain a wildcard. Two independent reasons:
 *
 *   1. It is concatenated with a path — `${APP_URL}/admin/...` — so
 *      "https://*.opalswift.com" yields a string that is not a URL.
 *   2. Google requires redirect URIs to match EXACTLY: scheme, host, port and
 *      path. Wildcards are not permitted, so a pattern could never be
 *      registered in the first place.
 *
 * Wildcards belong to the layers that MATCH rather than CONSTRUCT — the DNS
 * record and the Cloudflare Workers route (`*.opalswift.com/*` in
 * apps/web/wrangler.jsonc). Per-tenant addressing is tenantBaseUrl().
 *
 * If you are about to use this to build a link that a PARENT will click, you
 * want tenantBaseUrl(subdomain) instead — otherwise every tenant's families are
 * sent to whichever studio happens to be named in APP_URL.
 */
export function platformAppUrl(): string {
  const url = getEnv("APP_URL")?.trim();
  if (!url) {
    throw new Error("APP_URL is not configured on the server");
  }
  if (url.includes("*")) {
    throw new Error(
      "APP_URL must be a concrete origin, not a wildcard — it is concatenated " +
        "with a path, and OAuth redirect URIs must match exactly. For per-tenant " +
        "links use tenantBaseUrl(subdomain).",
    );
  }
  return url.replace(/\/$/, "");
}

/** Columns a caller must select for tenantBaseUrl() to work. */
export const TENANT_URL_COLUMNS = "subdomain";

/**
 * Look the subdomain up by tenant id. For call sites that build a link before
 * they have the tenant row — cheaper than reordering their queries, and it
 * keeps the tenant-awareness impossible to forget.
 */
export async function tenantBaseUrlFor(
  service: { from: (t: string) => any },
  tenantId: string,
): Promise<string> {
  const { data, error } = await service
    .from("tenants")
    .select(TENANT_URL_COLUMNS)
    .eq("id", tenantId)
    .single();
  if (error || !data?.subdomain) {
    throw new Error(`Cannot resolve subdomain for tenant ${tenantId} — cannot build its links.`);
  }
  return tenantBaseUrl(data.subdomain as string);
}
