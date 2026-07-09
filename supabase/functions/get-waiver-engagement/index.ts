/**
 * get-waiver-engagement
 *
 * Returns engagement + active consent template for the guest waiver signing
 * page (/enrol/complete). Requires a valid WaiverToken in the Authorization
 * header — no Supabase session needed.
 *
 * Authorization: WaiverToken <token>
 *
 * Response:
 *   { personId, offeringId, tenantId, template: { id, version, name, content } }
 */

import { corsHeaders, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient } from "../../packages/edge-runtime/src/supabase.ts";
import {
  extractWaiverToken,
  verifyWaiverToken,
} from "../_shared/waiver-token.ts";
import { resolveAllowedTokenRecipientEmails } from "../_shared/token-recipient.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const rawToken = extractWaiverToken(req.headers.get("authorization"));
    if (!rawToken) return jsonResponse({ error: "Missing or invalid WaiverToken" }, 401);

    const payload = await verifyWaiverToken(rawToken);
    if (!payload) return jsonResponse({ error: "WaiverToken invalid or expired" }, 401);

    const service = createServiceClient();

    // Load the engagement and verify it belongs to this token's tenant + engagement
    const { data: eng, error: engError } = await service
      .from("engagements")
      .select("id, person_id, offering_id, status, tenant_id")
      .eq("id", payload.eid)
      .eq("tenant_id", payload.tid)
      .single();

    if (engError || !eng) {
      return jsonResponse({ error: "Engagement not found" }, 404);
    }

    if (eng.status === "active") {
      return jsonResponse({ alreadySigned: true }, 200);
    }

    if (eng.status === "cancelled") {
      return jsonResponse({ cancelled: true }, 200);
    }

    if (eng.status !== "pending_waiver") {
      return jsonResponse({ error: "Engagement is not pending waiver" }, 409);
    }

    const tokenEmail = payload.em.trim().toLowerCase();
    const allowedEmails = await resolveAllowedTokenRecipientEmails(service, {
      tenantId: payload.tid,
      engagementId: eng.id as string,
      personId: eng.person_id as string,
    });
    if (!tokenEmail || !allowedEmails.has(tokenEmail)) {
      return jsonResponse({ error: "Token email mismatch" }, 401);
    }

    // Load the active consent template
    const { data: template, error: tmplError } = await service
      .from("consent_templates")
      .select("id, version, name, content")
      .eq("tenant_id", payload.tid)
      .eq("status", "active")
      .maybeSingle();

    if (tmplError || !template) {
      return jsonResponse({ error: "No active consent template" }, 404);
    }

    return jsonResponse({
      personId: eng.person_id as string,
      offeringId: eng.offering_id as string,
      tenantId: payload.tid,
      template: {
        id: template.id as string,
        version: template.version as string,
        name: template.name as string,
        content: template.content as string,
      },
    });
  } catch (err) {
    console.error("[get-waiver-engagement]", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500,
    );
  }
});
