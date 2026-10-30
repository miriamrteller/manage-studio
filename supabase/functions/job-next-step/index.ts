/**
 * job-next-step
 *
 * After a client signs a JOB contract on /enrol/complete, tells the page
 * where to send them next: the deposit pay page (/pay/:token) while the
 * deposit is unpaid, otherwise the client portal. The pay link is looked up
 * here from the job's accepted quote — never taken from the URL.
 *
 * Authorization: WaiverToken <token> (the same signing link; no session)
 * Body: { engagementId } — must be the token's own engagement.
 *
 * Responses:
 *   200 { next: "pay_deposit", payPath, amountMinor, currency }
 *   200 { next: "portal", portalPath, reason: "deposit_paid" | "no_deposit" }
 *   401 invalid/expired token · 403 token for another job / email mismatch
 *   404 not a job (dance waivers never call this) · 409 contract not signed yet
 */
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { extractWaiverToken, verifyWaiverToken } from "../_shared/waiver-token.ts";
import { resolveAllowedTokenRecipientEmails } from "../_shared/token-recipient.ts";
import { type NextStepRequest, resolveJobNextStep } from "../_shared/jobs/booking-next-steps.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const rawToken = extractWaiverToken(req.headers.get("authorization"));
    if (!rawToken) return jsonResponse({ error: "Missing or invalid WaiverToken" }, 401);

    const service = createServiceClient();
    const payload = await verifyWaiverToken(service, rawToken);
    if (!payload) return jsonResponse({ error: "WaiverToken invalid or expired" }, 401);

    const body = (await req.json().catch(() => null)) as { engagementId?: unknown } | null;
    const requestedEngagementId = typeof body?.engagementId === "string" ? body.engagementId : "";
    const tenantId = payload.tid;

    const step = await resolveJobNextStep({
      loadJob: async (engagementId) => {
        const { data: job } = await service
          .from("job_details")
          .select("engagement_id")
          .eq("tenant_id", tenantId)
          .eq("engagement_id", engagementId)
          .maybeSingle();
        if (!job) return null;
        const { data: eng } = await service
          .from("engagements")
          .select("person_id, waiver_evidence_id")
          .eq("tenant_id", tenantId)
          .eq("id", engagementId)
          .maybeSingle();
        if (!eng) return null;
        return {
          personId: eng.person_id as string,
          waiverEvidenceId: (eng.waiver_evidence_id as string | null) ?? null,
        };
      },
      allowedEmails: (engagementId, personId) =>
        resolveAllowedTokenRecipientEmails(service, { tenantId, engagementId, personId }),
      loadAcceptedQuoteResult: async (engagementId) => {
        const { data } = await service
          .from("quotes")
          .select("accepted_result")
          .eq("tenant_id", tenantId)
          .eq("engagement_id", engagementId)
          .eq("status", "accepted")
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return (data?.accepted_result as { deposit_minor?: number; payment_request_ids?: unknown } | null) ?? null;
      },
      loadRequests: async (engagementId) => {
        const { data } = await service
          .from("job_payment_requests")
          .select("id, engagement_id, status, public_token, amount_minor, currency")
          .eq("tenant_id", tenantId)
          .eq("engagement_id", engagementId);
        return (data ?? []) as NextStepRequest[];
      },
    }, { token: payload, requestedEngagementId });

    if (!step.ok) return jsonResponse({ error: step.code }, step.status);
    const { ok: _ok, ...rest } = step;
    return jsonResponse(rest);
  } catch (err) {
    console.error("[job-next-step]", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
