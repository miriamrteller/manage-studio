import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

interface SaveResumeBody {
  resumeKey: string;
  tenantSubdomain: string;
  engagementId?: string | null;
  state: Record<string, unknown>;
  expiresAt?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as SaveResumeBody;
    if (!body.resumeKey || !body.tenantSubdomain || !body.state) {
      return jsonResponse({ error: "resumeKey, tenantSubdomain and state are required" }, 400);
    }

    const service = createServiceClient();
    const { data: tenant } = await service
      .from("tenants")
      .select("id")
      .eq("subdomain", body.tenantSubdomain.trim())
      .single();
    if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404);

    if (body.engagementId) {
      const { data: engagement } = await service
        .from("engagements")
        .select("id")
        .eq("id", body.engagementId)
        .eq("tenant_id", tenant.id)
        .maybeSingle();
      if (!engagement) return jsonResponse({ error: "Engagement not found" }, 404);
    }

    const expiresAt = body.expiresAt
      ? new Date(body.expiresAt).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error } = await service
      .from("enrolment_resume_drafts")
      .upsert(
        {
          tenant_id: tenant.id,
          engagement_id: body.engagementId ?? null,
          resume_key: body.resumeKey,
          state_json: body.state,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "resume_key" },
      );

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ success: true });
  } catch (err) {
    console.error("[save-enrolment-resume]", err instanceof Error ? err.message : err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});

