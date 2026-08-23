/**
 * CORS origin policy for the CRM endpoints — pure and testable.
 *
 * Allowed, in order:
 *   1. http://localhost:8081            — Expo web dev server
 *   2. one explicitly configured origin — CRM_CONTACTS_ALLOWED_ORIGIN secret
 *   3. https://<subdomain>.<rootDomain> — any single-label subdomain of the
 *      platform root domain (APP_ROOT_DOMAIN). The platform controls that DNS,
 *      so every such origin is ours; this is what makes new tenants work with
 *      zero per-tenant CORS config (self-onboard rule, docs/plans/
 *      crm-lead-capture-channels.md).
 *
 * Never "*", and never a suffix match on a plain string — the check parses the
 * origin and compares the hostname exactly, so "evilopalswift.com" or
 * "opalswift.com.evil.example" cannot sneak through.
 */

const SUBDOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface CrmOriginPolicy {
  /** Platform root domain, e.g. "opalswift.com". Null disables rule 3. */
  rootDomain: string | null;
  /** One extra allowed origin (exact match). Null disables rule 2. */
  configuredOrigin: string | null;
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

export function isAllowedCrmOrigin(origin: string | null, policy: CrmOriginPolicy): boolean {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);

  if (normalized === "http://localhost:8081") return true;

  if (policy.configuredOrigin && normalized === normalizeOrigin(policy.configuredOrigin)) {
    return true;
  }

  if (policy.rootDomain) {
    const root = policy.rootDomain.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
    let url: URL;
    try {
      url = new URL(normalized);
    } catch {
      return false;
    }
    if (url.protocol !== "https:" || url.port !== "") return false;
    const host = url.hostname;
    if (!host.endsWith(`.${root}`)) return false;
    const label = host.slice(0, host.length - root.length - 1);
    return SUBDOMAIN_LABEL.test(label);
  }

  return false;
}
