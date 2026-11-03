/**
 * Self-serve custom domains: every decision, behind injected dependencies so
 * it is tested without Cloudflare or a database (service.test.ts). The Edge
 * Function (custom-domain/index.ts) wires the real ones.
 *
 * Owner rules:
 * - Automatic checks run for 24 hours after a request or a "Check now"; then
 *   the domain is 'paused' until "Check now", which always works and opens a
 *   new 24-hour window.
 * - While paused the Cloudflare hostname is kept, so a late "Check now" finds
 *   it at once. It is deleted on Remove, or 30 days after the request if it
 *   never became active.
 * - Removing needs the hostname typed again (checked here, not only in the UI).
 * - The poller calls Cloudflare only for pending rows inside their window.
 */
import { checkHostname, type HostnameErrorCode } from "./hostname.ts";
import type { CfCustomHostname, CloudflareSaas } from "./cloudflare.ts";

export const AUTO_CHECK_HOURS = 24;
export const UNACTIVATED_DELETE_DAYS = 30;

export type DomainStatus = "pending" | "active" | "paused" | "failed" | "removed";

export interface DnsRecord {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  purpose: "route" | "ownership" | "certificate";
}

export interface DomainRow {
  id: string;
  tenant_id: string;
  hostname: string;
  status: DomainStatus;
  managed_by: "self_serve" | "opalswift";
  cf_hostname_id: string | null;
  ssl_status: string | null;
  dns_records: DnsRecord[];
  error_code: string | null;
  auto_check_until: string | null;
  last_checked_at: string | null;
  activated_at: string | null;
  delete_after: string | null;
  removed_at: string | null;
}

export interface Deps {
  now(): Date;
  cf: CloudflareSaas;
  /** CNAME target studios point at (the SaaS fallback origin). */
  cnameTarget: string;
  /** Registrable domains that are zones in our own Cloudflare account (path A). */
  ownZones: Set<string>;
  enabled(tenantId: string): Promise<boolean>;
  hostnameAvailable(tenantId: string, hostname: string): Promise<boolean>;
  liveRow(tenantId: string): Promise<DomainRow | null>;
  insertRow(row: Omit<DomainRow, "id">, requestedBy: string | null): Promise<DomainRow>;
  updateRow(id: string, patch: Partial<DomainRow>): Promise<DomainRow>;
  /** tenants.custom_domain: the address links and emails use. */
  setTenantDomain(tenantId: string, hostname: string | null): Promise<void>;
  /** Rows the poller may touch (pending, paused, failed; never removed). */
  pollCandidates(): Promise<DomainRow[]>;
  /** Tell the redirect-allowlist sync that the active set changed (step 4). */
  activeDomainsChanged(): Promise<void>;
}

export type ServiceError =
  | { error: "not_enabled" }
  | { error: "invalid_hostname"; code: HostnameErrorCode }
  | { error: "hostname_taken" }
  | { error: "already_has_domain" }
  | { error: "no_domain" }
  | { error: "confirm_mismatch" }
  | { error: "managed_by_opalswift" }
  | { error: "cloudflare_unavailable" };

const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000).toISOString();
const addDays = (d: Date, days: number) => addHours(d, days * 24);

/** The records to show the studio, from Cloudflare's answer. */
export function recordsFor(hostname: string, cnameTarget: string, cf: CfCustomHostname | null): DnsRecord[] {
  const out: DnsRecord[] = [{ type: "CNAME", name: hostname, value: cnameTarget, purpose: "route" }];
  const own = cf?.ownership_verification;
  if (own?.name && own.value) out.push({ type: "TXT", name: own.name, value: own.value, purpose: "ownership" });
  for (const v of cf?.ssl?.validation_records ?? []) {
    if (v.txt_name && v.txt_value) out.push({ type: "TXT", name: v.txt_name, value: v.txt_value, purpose: "certificate" });
  }
  return out;
}

/** Cloudflare's state in one of a few plain-language codes the UI explains. */
export function problemCode(cf: CfCustomHostname): string | null {
  const text = [...(cf.verification_errors ?? []), ...(cf.ssl?.validation_errors ?? []).map((e) => e.message ?? "")]
    .join(" ").toLowerCase();
  if (!text) return null;
  if (text.includes("caa")) return "caa_blocked";
  if (text.includes("cname") && (text.includes("not") || text.includes("does"))) return "dns_not_pointing";
  if (text.includes("txt") || text.includes("ownership")) return "ownership_txt_missing";
  if (text.includes("blocked") || text.includes("banned")) return "hostname_blocked";
  return "dns_not_ready";
}

export async function requestDomain(
  deps: Deps,
  tenantId: string,
  requestedBy: string | null,
  input: unknown,
): Promise<DomainRow | ServiceError> {
  if (!(await deps.enabled(tenantId))) return { error: "not_enabled" };
  const checked = checkHostname(input);
  if (!checked.ok) return { error: "invalid_hostname", code: checked.code };
  const { hostname, registrableDomain } = checked;
  if (await deps.liveRow(tenantId)) return { error: "already_has_domain" };
  if (!(await deps.hostnameAvailable(tenantId, hostname))) return { error: "hostname_taken" };

  const now = deps.now();
  // A zone in our own Cloudflare account is connected by OpalSwift (path A).
  if (deps.ownZones.has(registrableDomain)) {
    return await deps.insertRow({
      tenant_id: tenantId, hostname, status: "pending", managed_by: "opalswift",
      cf_hostname_id: null, ssl_status: null, dns_records: [], error_code: "opalswift_connects",
      auto_check_until: null, last_checked_at: null, activated_at: null, delete_after: null, removed_at: null,
    }, requestedBy);
  }

  let cf: CfCustomHostname;
  try {
    cf = await deps.cf.create(hostname);
  } catch {
    return { error: "cloudflare_unavailable" };
  }
  return await deps.insertRow({
    tenant_id: tenantId, hostname, status: "pending", managed_by: "self_serve",
    cf_hostname_id: cf.id, ssl_status: cf.ssl?.status ?? null,
    dns_records: recordsFor(hostname, deps.cnameTarget, cf), error_code: null,
    auto_check_until: addHours(now, AUTO_CHECK_HOURS), last_checked_at: now.toISOString(),
    activated_at: null, delete_after: addDays(now, UNACTIVATED_DELETE_DAYS), removed_at: null,
  }, requestedBy);
}

/** One check against Cloudflare. `manual` ("Check now") reopens the 24-hour window. */
export async function checkDomain(deps: Deps, row: DomainRow, manual: boolean): Promise<DomainRow | ServiceError> {
  if (row.managed_by === "opalswift" || !row.cf_hostname_id) {
    return manual ? { error: "managed_by_opalswift" } : row;
  }
  if (row.status === "active" && !manual) return row;
  const now = deps.now();
  const windowPatch: Partial<DomainRow> = manual
    ? { auto_check_until: addHours(now, AUTO_CHECK_HOURS), status: row.status === "active" ? "active" : "pending" }
    : {};
  let cf: CfCustomHostname | null;
  try {
    cf = await deps.cf.get(row.cf_hostname_id);
  } catch {
    return manual ? { error: "cloudflare_unavailable" } : row;
  }
  if (!cf) {
    // Gone at Cloudflare (deleted by hand): ask the studio to start again.
    return await deps.updateRow(row.id, { ...windowPatch, status: "failed", error_code: "hostname_missing", last_checked_at: now.toISOString() });
  }
  const active = cf.status === "active" && cf.ssl?.status === "active";
  const wasActive = row.status === "active";
  if (active) {
    const updated = await deps.updateRow(row.id, {
      status: "active", ssl_status: cf.ssl?.status ?? null, error_code: null,
      activated_at: row.activated_at ?? now.toISOString(), last_checked_at: now.toISOString(),
      dns_records: recordsFor(row.hostname, deps.cnameTarget, cf), delete_after: null,
    });
    if (!wasActive) {
      await deps.setTenantDomain(row.tenant_id, row.hostname);
      await deps.activeDomainsChanged();
    }
    return updated;
  }
  return await deps.updateRow(row.id, {
    ...windowPatch,
    ssl_status: cf.ssl?.status ?? null,
    error_code: problemCode(cf),
    dns_records: recordsFor(row.hostname, deps.cnameTarget, cf),
    last_checked_at: now.toISOString(),
  });
}

export async function removeDomain(deps: Deps, tenantId: string, confirmHostname: unknown): Promise<DomainRow | ServiceError> {
  const row = await deps.liveRow(tenantId);
  if (!row) return { error: "no_domain" };
  if (typeof confirmHostname !== "string" || confirmHostname.trim().toLowerCase() !== row.hostname) {
    return { error: "confirm_mismatch" };
  }
  if (row.managed_by === "opalswift") return { error: "managed_by_opalswift" };
  // Cloudflare first: traffic must stop before the studio can be told it is gone.
  if (row.cf_hostname_id) {
    try {
      await deps.cf.remove(row.cf_hostname_id);
    } catch {
      return { error: "cloudflare_unavailable" };
    }
  }
  const wasActive = row.status === "active";
  if (wasActive) await deps.setTenantDomain(tenantId, null);
  const updated = await deps.updateRow(row.id, { status: "removed", removed_at: deps.now().toISOString() });
  if (wasActive) await deps.activeDomainsChanged();
  return updated;
}

export interface PollSummary {
  checked: number;
  paused: number;
  deleted: number;
}

/** The cron: check pending rows in their window, pause expired ones, drop 30-day leftovers. */
export async function pollDomains(deps: Deps): Promise<PollSummary> {
  const now = deps.now();
  const summary: PollSummary = { checked: 0, paused: 0, deleted: 0 };
  for (const row of await deps.pollCandidates()) {
    if (row.managed_by === "opalswift" || row.status === "active" || row.status === "removed") continue;
    if (row.delete_after && new Date(row.delete_after) <= now) {
      if (row.cf_hostname_id) {
        try {
          await deps.cf.remove(row.cf_hostname_id);
        } catch {
          continue; // try again next run
        }
      }
      await deps.updateRow(row.id, { status: "removed", removed_at: now.toISOString(), error_code: "expired_unactivated" });
      summary.deleted++;
      continue;
    }
    if (row.status !== "pending") continue;
    if (!row.auto_check_until || new Date(row.auto_check_until) <= now) {
      await deps.updateRow(row.id, { status: "paused" });
      summary.paused++;
      continue;
    }
    await checkDomain(deps, row, false);
    summary.checked++;
  }
  return summary;
}
