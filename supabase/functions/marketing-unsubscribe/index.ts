import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { verifyUnsubscribeToken } from "../_shared/unsubscribe-token.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

/**
 * marketing-unsubscribe — PUBLIC. The unsubscribe link in a marketing message
 * opens /unsubscribe/:token, which POSTs the token here. A valid token appends
 * a "withdrawn" consent record for that channel (proof of the opt-out) and
 * clears the lead's quick flag. Idempotent: unsubscribing twice is harmless.
 *
 * Body: { token: string }
 * 200 { ok: true, studio: string, channel } · 400 bad request · 401 invalid token
 */
Deno.serve(withMonitoring("marketing-unsubscribe", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let token: unknown;
  try {
    token = (await req.json())?.token;
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }
  if (typeof token !== "string" || token.length < 10 || token.length > 2000) {
    return jsonResponse({ error: "Invalid token" }, 400);
  }

  const service = createServiceClient();
  const payload = await verifyUnsubscribeToken(service, token);
  if (!payload) return jsonResponse({ error: "Invalid or unknown link" }, 401);

  const kind = `marketing_${payload.ch}`;
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const { error } = await service.from("consent_records").insert({
    tenant_id: payload.tid,
    person_id: payload.pid ?? null,
    lead_id: payload.lid ?? null,
    kind,
    granted: false,
    wording: "Unsubscribed via the link in a marketing message.",
    source: "unsubscribe",
    ip_address: ip,
    user_agent: req.headers.get("user-agent")?.slice(0, 512) ?? null,
  });
  if (error) {
    console.error("marketing-unsubscribe: insert failed", error.message);
    return jsonResponse({ error: "Could not unsubscribe. Please try again." }, 500);
  }
  if (payload.lid) {
    await service.from("leads").update({ marketing_consent: false }).eq("id", payload.lid);
  }

  const { data: tenant } = await service.from("tenants").select("name").eq("id", payload.tid).maybeSingle();
  return jsonResponse({ ok: true, studio: tenant?.name ?? "", channel: payload.ch }, 200);
}));
