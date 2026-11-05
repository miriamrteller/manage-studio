/**
 * custom-domain — a studio connects its own address (Settings → Custom domain).
 *
 * Signed-in studio admin (Authorization: Bearer <user JWT>), body { action, … }:
 *   status                         the studio's domain (or none) and whether the feature is on
 *   request  { hostname }          create the Cloudflare for SaaS hostname, return the DNS records
 *   check                          "Check now": check at once, open a new 24-hour window
 *   remove   { confirmHostname }   the hostname typed again; deletes at Cloudflare, then here
 * Cron (x-cron-secret or Bearer <CRON_SECRET>, fail-closed), body { action: "poll" }:
 *   (pg_cron every 10 minutes: migration 20261103124800_custom_domain_poller.sql)
 *   poll                           check pending domains inside their window, pause expired
 *                                  ones, delete never-activated ones after 30 days
 *
 * Rules and their tests: _shared/custom-domain/service.ts. Only this function
 * writes tenant_custom_domains (service role). Feature switch: custom_domain_rollout.
 */
import { z } from "npm:zod@4.6.7";
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { cloudflareSaas } from "../_shared/custom-domain/cloudflare.ts";
import {
  checkDomain,
  type Deps,
  type DomainRow,
  pollDomains,
  removeDomain,
  requestDomain,
} from "../_shared/custom-domain/service.ts";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }),
  z.object({ action: z.literal("request"), hostname: z.string().max(300) }),
  z.object({ action: z.literal("check") }),
  z.object({ action: z.literal("remove"), confirmHostname: z.string().max(300) }),
  z.object({ action: z.literal("poll") }),
]);

const COLUMNS =
  "id, tenant_id, hostname, status, managed_by, cf_hostname_id, ssl_status, dns_records, error_code, auto_check_until, last_checked_at, activated_at, delete_after, removed_at";

/** What the studio sees: no Cloudflare ids. */
function publicView(row: DomainRow | null) {
  if (!row) return null;
  const { cf_hostname_id: _cf, tenant_id: _t, ...rest } = row;
  return rest;
}

type Service = ReturnType<typeof createServiceClient>;

/**
 * Starts .github/workflows/auth-redirects-sync.yml so the new or removed domain
 * reaches Supabase's redirect allowlist within a minute. Best-effort: without
 * GITHUB_DISPATCH_TOKEN, or if GitHub is down, the nightly run catches up.
 */
async function dispatchRedirectSync(): Promise<void> {
  const token = Deno.env.get("GITHUB_DISPATCH_TOKEN") ?? "";
  if (!token) return;
  const repo = Deno.env.get("GITHUB_DISPATCH_REPO") || "miriamrteller/manage-studio";
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/auth-redirects-sync.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "opalswift-custom-domain",
      },
      body: JSON.stringify({ ref: "main" }),
    });
    if (!res.ok) console.warn(`[custom-domain] redirect sync dispatch failed: HTTP ${res.status}`);
  } catch (err) {
    console.warn("[custom-domain] redirect sync dispatch failed", err);
  }
}

function buildDeps(service: Service): Deps | null {
  const token = Deno.env.get("CLOUDFLARE_SAAS_API_TOKEN") ?? "";
  const zoneId = Deno.env.get("CLOUDFLARE_SAAS_ZONE_ID") ?? "";
  if (!token || !zoneId) return null;
  const one = async (q: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as DomainRow;
  };
  return {
    now: () => new Date(),
    cf: cloudflareSaas({ token, zoneId }),
    cnameTarget: Deno.env.get("CUSTOM_DOMAIN_CNAME_TARGET") || "proxy-fallback.opalswift.com",
    ownZones: new Set(
      (Deno.env.get("CUSTOM_DOMAIN_OWN_ZONES") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    ),
    async enabled(tenantId) {
      const { data } = await service.rpc("custom_domain_enabled", { p_tenant_id: tenantId });
      return data === true;
    },
    async hostnameAvailable(tenantId, hostname) {
      const { data, error } = await service.rpc("custom_domain_hostname_available", {
        p_tenant_id: tenantId,
        p_hostname: hostname,
      });
      if (error) throw new Error(error.message);
      return data === true;
    },
    async liveRow(tenantId) {
      const { data, error } = await service.from("tenant_custom_domains").select(COLUMNS)
        .eq("tenant_id", tenantId).neq("status", "removed").maybeSingle();
      if (error) throw new Error(error.message);
      return (data as DomainRow | null) ?? null;
    },
    insertRow: (row, requestedBy) =>
      one(service.from("tenant_custom_domains").insert({ ...row, requested_by: requestedBy }).select(COLUMNS).single()),
    updateRow: (id, patch) =>
      one(service.from("tenant_custom_domains").update(patch).eq("id", id).select(COLUMNS).single()),
    async setTenantDomain(tenantId, hostname) {
      const { error } = await service.from("tenants").update({ custom_domain: hostname }).eq("id", tenantId);
      if (error) throw new Error(error.message);
    },
    async pollCandidates() {
      // Pending rows, plus paused/failed rows whose 30 days are up. Nothing else
      // is returned, so a quiet night makes no Cloudflare call at all.
      const { data, error } = await service.from("tenant_custom_domains").select(COLUMNS)
        .eq("managed_by", "self_serve")
        .or(`status.eq.pending,and(status.in.(paused,failed),delete_after.lte.${new Date().toISOString()})`)
        .limit(200);
      if (error) throw new Error(error.message);
      return (data as DomainRow[] | null) ?? [];
    },
    activeDomainsChanged: dispatchRedirectSync,
  };
}

Deno.serve(withMonitoring("custom-domain", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid payload" }, 400);
  }
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const service = createServiceClient();

  if (body.action === "poll") {
    // pg_cron sends x-cron-secret (same as the other jobs); Bearer also accepted.
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const sent = req.headers.get("x-cron-secret") ?? bearer;
    if (!cronSecret || sent !== cronSecret) return jsonResponse({ error: "Unauthorized" }, 401);
    const deps = buildDeps(service);
    if (!deps) return jsonResponse({ skipped: "not_configured" });
    return jsonResponse(await pollDomains(deps));
  }

  if (!bearer) return jsonResponse({ error: "Missing authorization" }, 401);
  const { data: { user }, error: authError } = await service.auth.getUser(bearer);
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);
  const { data: profile } = await service.from("user_profiles").select("tenant_id, role").eq("id", user.id).single();
  const tenantId = profile?.tenant_id as string | undefined;
  const roles = (profile?.role as string[] | null) ?? [];
  if (!tenantId || !roles.includes("tenant_admin")) return jsonResponse({ error: "Forbidden" }, 403);

  const deps = buildDeps(service);
  if (!deps) return jsonResponse({ error: "not_configured" }, 503);
  if (!(await deps.enabled(tenantId))) return jsonResponse({ error: "not_enabled" }, 403);

  const reply = (r: DomainRow | { error: string }) =>
    "error" in r ? jsonResponse(r, r.error === "cloudflare_unavailable" ? 502 : 400) : jsonResponse({ domain: publicView(r) });

  switch (body.action) {
    case "status":
      return jsonResponse({ enabled: true, domain: publicView(await deps.liveRow(tenantId)) });
    case "request":
      return reply(await requestDomain(deps, tenantId, user.id, body.hostname));
    case "check": {
      const row = await deps.liveRow(tenantId);
      if (!row) return jsonResponse({ error: "no_domain" }, 400);
      return reply(await checkDomain(deps, row, true));
    }
    case "remove":
      return reply(await removeDomain(deps, tenantId, body.confirmHostname));
  }
}));
