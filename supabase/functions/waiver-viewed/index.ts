import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  currentHmacVersion,
  getHmacKey,
  hmacSha256Base64url,
} from "../_shared/hmac.ts";
import {
  extractWaiverToken,
  verifyWaiverToken,
} from "../_shared/waiver-token.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const service = createServiceClient();

    // Two auth paths: Supabase session (authenticated users) or WaiverToken (guests)
    let tenantId: string;
    let actorId: string | null = null;

    const rawWaiverToken = extractWaiverToken(authHeader);
    if (rawWaiverToken) {
      // Guest path — validate the waiver link token
      const wtp = await verifyWaiverToken(rawWaiverToken);
      if (!wtp) return jsonResponse({ error: "WaiverToken invalid or expired" }, 401);
      tenantId = wtp.tid;
    } else {
      // Authenticated path — validate Supabase session
      const jwt = authHeader.replace("Bearer ", "");
      if (!jwt) return jsonResponse({ error: "Missing authorization" }, 401);

      const { data: { user }, error: authError } = await service.auth.getUser(jwt);
      if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

      const { data: profile } = await service
        .from("user_profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();
      if (!profile?.tenant_id) return jsonResponse({ error: "User has no tenant" }, 403);
      tenantId = profile.tenant_id as string;
      actorId = user.id;
    }

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

    // Append-only event record for audit chain (actor_id is null for guests)
    await service.from("waiver_events").insert({
      tenant_id: tenantId,
      event_type: "viewed",
      waiver_evidence_id: null,
      actor_id: actorId,
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
