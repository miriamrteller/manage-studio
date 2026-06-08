import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  currentHmacVersion,
  getHmacKey,
  hmacSha256Base64url,
} from "../_shared/hmac.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const jwt = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!jwt) return jsonResponse({ error: "Missing authorization" }, 401);

    const service = createServiceClient();

    const { data: { user }, error: authError } = await service.auth.getUser(jwt);
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    // Derive tenant_id from user_profiles — NOT via get_my_tenant_id()
    // (get_my_tenant_id() uses auth.uid() which returns NULL with a service-role client)
    const { data: profile } = await service
      .from("user_profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (!profile?.tenant_id) return jsonResponse({ error: "User has no tenant" }, 403);
    const tenantId = profile.tenant_id as string;

    const body = await req.json().catch(() => null);
    if (!body?.person_id || !body?.consent_template_id) {
      return jsonResponse({ error: "person_id and consent_template_id are required" }, 400);
    }

    // Verify the template belongs to this tenant and is currently active
    const { data: template } = await service
      .from("consent_templates")
      .select("id")
      .eq("id", body.consent_template_id)
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .maybeSingle();
    if (!template) return jsonResponse({ error: "No active consent template found" }, 404);

    const viewed_at_ts = Math.floor(Date.now() / 1000);

    // Append-only event record for audit chain
    await service.from("waiver_events").insert({
      tenant_id: tenantId,
      event_type: "viewed",
      waiver_evidence_id: null,
      actor_id: user.id,
      metadata: {
        person_id: body.person_id,
        consent_template_id: body.consent_template_id,
      },
    });

    const version = currentHmacVersion();
    const key = getHmacKey(version);
    const view_token = await hmacSha256Base64url(
      key,
      `${body.person_id}:${body.consent_template_id}:${viewed_at_ts}`,
    );

    return jsonResponse({
      view_token,
      viewed_at_ts,
      expires_at: new Date((viewed_at_ts + 900) * 1000).toISOString(),
    });
  } catch (err) {
    console.error("[waiver-viewed]", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500,
    );
  }
});
