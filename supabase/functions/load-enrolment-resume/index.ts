import { corsHeaders, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient } from "../../packages/edge-runtime/src/supabase.ts";

interface LoadResumeBody {
  resumeKey: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as LoadResumeBody;
    if (!body.resumeKey) return jsonResponse({ error: "resumeKey is required" }, 400);

    const service = createServiceClient();
    const { data: draft } = await service
      .from("enrolment_resume_drafts")
      .select("id, state_json, expires_at")
      .eq("resume_key", body.resumeKey)
      .maybeSingle();

    if (!draft) return jsonResponse({ error: "Resume draft not found" }, 404);
    if (new Date(draft.expires_at as string).getTime() < Date.now()) {
      return jsonResponse({ error: "Resume draft expired" }, 410);
    }

    return jsonResponse({ state: draft.state_json });
  } catch (err) {
    console.error("[load-enrolment-resume]", err instanceof Error ? err.message : err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});

