import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/supabase.ts";
import { extractWaiverToken, verifyWaiverToken } from "../_shared/waiver-token.ts";
import { resolveAllowedTokenRecipientEmails } from "../_shared/token-recipient.ts";

interface StatusBody {
  engagement_id: string;
  enrolment_token?: string;
}

/**
 * Lightweight payment-status poll for hosted-page providers (Grow): the frontend opens the
 * Grow page, then polls this endpoint until the webhook has finalised the charge. It returns
 * only the boolean outcome plus the payment id / failure reason so it can be called from a
 * guest (token) context without leaking finance rows.
 *
 * Auth mirrors create-checkout: an authenticated Bearer session scoped to the engagement's
 * tenant, or a valid enrolment WaiverToken whose email is on the engagement's recipient list.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as StatusBody;
    if (!body.engagement_id) {
      return jsonResponse({ error: "engagement_id is required" }, 400);
    }

    const service = createServiceClient();
    const authHeader = req.headers.get("Authorization") ?? "";

    const { data: engagement } = await service
      .from("engagements")
      .select("id, tenant_id, person_id, status")
      .eq("id", body.engagement_id)
      .single();
    if (!engagement) return jsonResponse({ error: "Engagement not found" }, 404);

    const tenantId = engagement.tenant_id as string;
    let authorized = false;

    const rawToken = extractWaiverToken(authHeader) ?? body.enrolment_token ?? null;
    const verifiedToken = rawToken ? await verifyWaiverToken(rawToken) : null;

    if (verifiedToken) {
      if (verifiedToken.eid !== body.engagement_id || verifiedToken.tid !== tenantId) {
        return jsonResponse({ error: "Token does not match engagement" }, 403);
      }
      const allowedEmails = await resolveAllowedTokenRecipientEmails(service, {
        tenantId,
        engagementId: body.engagement_id,
        personId: engagement.person_id as string,
      });
      authorized = allowedEmails.has(verifiedToken.em.trim().toLowerCase());
    } else if (authHeader.startsWith("Bearer ")) {
      const auth = await requireAuthUser(req);
      if (!("error" in auth)) {
        const { data: profile } = await service
          .from("user_profiles")
          .select("tenant_id")
          .eq("id", auth.user.id)
          .maybeSingle();
        authorized = profile?.tenant_id === tenantId;
      }
    }

    if (!authorized) {
      return jsonResponse({ error: "Unauthorized for engagement" }, 401);
    }

    const { data: payment } = await service
      .from("payments")
      .select("id, status")
      .eq("engagement_id", body.engagement_id)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (payment) {
      return jsonResponse({ paid: true, paymentId: payment.id });
    }

    const { data: failure } = await service
      .from("audit_log")
      .select("after_state")
      .eq("tenant_id", tenantId)
      .eq("action", "payment.failed")
      .eq("entity_id", body.engagement_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const failureReason =
      failure?.after_state && typeof failure.after_state === "object"
        ? ((failure.after_state as Record<string, unknown>).message as string | undefined) ?? null
        : null;

    return jsonResponse({ paid: false, failureReason });
  } catch (err) {
    console.error("[get-payment-status]", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
