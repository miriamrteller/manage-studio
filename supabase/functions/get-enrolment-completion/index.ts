import { corsHeaders, jsonResponse, internalError } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { extractWaiverToken, verifyWaiverToken } from "../_shared/waiver-token.ts";
import {
  flattenCompletionContext,
  loadEnrolmentCompletionContext,
} from "../_shared/enrolment-completion-context.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { readerLanguage } from "../_shared/studio-legal.ts";

Deno.serve(withMonitoring("get-enrolment-completion", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const rawToken = extractWaiverToken(req.headers.get("authorization"));
    if (!rawToken) return jsonResponse({ error: "Missing or invalid WaiverToken" }, 401);

    const service = createServiceClient();
    const payload = await verifyWaiverToken(service, rawToken);
    if (!payload) return jsonResponse({ error: "WaiverToken invalid or expired" }, 401);

    const body = await req.json().catch(() => null) as { language?: unknown } | null;
    const result = await loadEnrolmentCompletionContext(service, {
      language: readerLanguage(body?.language),
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
    return internalError("get-enrolment-completion", err);
  }
}));
