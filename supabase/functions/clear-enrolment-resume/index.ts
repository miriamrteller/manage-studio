import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

interface ClearResumeBody {
  resumeKey: string;
}

Deno.serve(async (req) => {
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
    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("[clear-enrolment-resume]", err instanceof Error ? err.message : err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});

