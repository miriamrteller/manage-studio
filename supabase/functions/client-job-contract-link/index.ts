/**
 * client-job-contract-link
 *
 * Photographer client portal "Sign now": returns a fresh signing link for the
 * caller's OWN unsigned shoot contract. Same signing stack as the admin's
 * send-job-contract-link (WaiverToken → /enrol/complete → get-waiver-engagement
 * → accept-waiver), but nothing is emailed: the client is already signed in
 * and is sent straight to the page.
 *
 * Authorization: Bearer <supabase session> (the client)
 * Body: { engagementId }
 * Response: { signPath } — app-relative /enrol/complete?engagementId=…&wt=…
 */
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { loadJobContractContext } from "../_shared/job-contract.ts";
import { decideClientContractLink } from "../_shared/jobs/client-contract-link.ts";
import { mintJobContractSignLink } from "../_shared/jobs/contract-sign-link.ts";

/** Short-lived: the client is redirected to the page immediately. */
const LINK_TTL_SECONDS = 2 * 3600;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Missing authorization" }, 401);

    const service = createServiceClient();
    const { data: { user }, error: authError } = await service.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => null)) as { engagementId?: unknown } | null;
    const engagementId = typeof body?.engagementId === "string" ? body.engagementId : "";
    if (!engagementId) return jsonResponse({ error: "engagementId is required" }, 400);

    const { data: profile } = await service
      .from("user_profiles")
      .select("id, tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    const tenantId = (profile?.tenant_id as string | null) ?? null;
    if (!tenantId) return jsonResponse({ error: "User has no tenant" }, 403);

    const [{ data: tenantRow }, { data: personRow }, { data: memberships }, { data: template }] = await Promise.all([
      service.from("tenants").select("language_default").eq("id", tenantId).maybeSingle(),
      service.from("people").select("id").eq("tenant_id", tenantId).eq("user_profile_id", user.id).maybeSingle(),
      service.from("account_members").select("account_id").eq("tenant_id", tenantId).eq("user_profile_id", user.id),
      service.from("consent_templates").select("id").eq("tenant_id", tenantId).eq("status", "active").maybeSingle(),
    ]);

    const job = await loadJobContractContext(service, {
      tenantId,
      engagementId,
      language: tenantRow?.language_default === "he" ? "he" : "en",
    });

    const decision = decideClientContractLink({
      callerTenantId: tenantId,
      callerPersonId: (personRow?.id as string | undefined) ?? null,
      callerAccountIds: (memberships ?? []).map((m) => m.account_id as string),
      job: job
        ? {
          tenantId,
          personId: job.personId,
          accountId: job.accountId,
          clientEmail: job.clientEmail,
          waiverEvidenceId: job.waiverEvidenceId,
          engagementStatus: job.engagementStatus,
          jobStatus: job.jobStatus,
        }
        : null,
      hasActiveTemplate: Boolean(template),
    });
    if (!decision.ok) return jsonResponse({ error: decision.error }, decision.status);

    const link = await mintJobContractSignLink(service, {
      tenantId,
      engagementId,
      email: decision.email,
      ttlSeconds: LINK_TTL_SECONDS,
    });
    return jsonResponse({ signPath: link.path });
  } catch (err) {
    console.error("[client-job-contract-link]", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
