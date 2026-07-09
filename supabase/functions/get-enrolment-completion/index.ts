import { corsHeaders, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient } from "../../packages/edge-runtime/src/supabase.ts";
import { extractWaiverToken, verifyWaiverToken } from "../_shared/waiver-token.ts";
import {
  flattenCompletionContext,
  loadEnrolmentCompletionContext,
} from "../_shared/enrolment-completion-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const rawToken = extractWaiverToken(req.headers.get("authorization"));
    if (!rawToken) return jsonResponse({ error: "Missing or invalid WaiverToken" }, 401);

    const payload = await verifyWaiverToken(rawToken);
    if (!payload) return jsonResponse({ error: "WaiverToken invalid or expired" }, 401);

    const service = createServiceClient();
    const result = await loadEnrolmentCompletionContext(service, {
      engagementId: payload.eid,
      tenantId: payload.tid,
      tokenEmail: payload.em.trim().toLowerCase(),
      useRecentEvidenceFallback: false,
    });

    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status);
    }

    return jsonResponse(flattenCompletionContext(result.context));
  } catch (err) {
    console.error("[get-enrolment-completion]", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
