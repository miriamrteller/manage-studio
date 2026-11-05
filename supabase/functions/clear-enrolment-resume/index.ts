import { corsHeaders, jsonResponse, internalError } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

interface ClearResumeBody {
  resumeKey: string;
}

Deno.serve(withMonitoring("clear-enrolment-resume", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as ClearResumeBody;
    if (!body.resumeKey) return jsonResponse({ error: "resumeKey is required" }, 400);

    const service = createServiceClient();
    const { error } = await service
      .from("enrolment_resume_drafts")
      .delete()
      .eq("resume_key", body.resumeKey);
    if (error) return internalError("clear-enrolment-resume", error);

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("[clear-enrolment-resume]", err instanceof Error ? err.message : err);
    return internalError("clear-enrolment-resume", err);
  }
}));

