import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { takbullApiForTenant } from "../_shared/payments/takbull/index.ts";
import { TakbullNotConnectedError } from "../_shared/payments/takbull/credentials.ts";
import { verifyTakbullConnection } from "../_shared/payments/takbull/verify.ts";

/**
 * "Test connection" for a studio's Takbull keys: a read-only GetDocumentSettings call with
 * the studio's own keys. It changes nothing in Takbull and doesn't need Takbull to be the
 * studio's provider yet (keys can be saved and checked before switching).
 */
Deno.serve(withMonitoring("verify-takbull-credentials", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();
  if (!profile?.tenant_id) return jsonResponse({ error: "Profile not found" }, 404);
  if (!Array.isArray(profile.role) || !profile.role.includes("tenant_admin")) {
    return jsonResponse({ error: "tenant_admin role required" }, 403);
  }

  try {
    const api = await takbullApiForTenant(service, profile.tenant_id as string);
    const result = await verifyTakbullConnection(api);
    return jsonResponse({ ok: result.valid, provider: "takbull", ...result }, result.valid ? 200 : 502);
  } catch (err) {
    if (err instanceof TakbullNotConnectedError) {
      return jsonResponse({ ok: false, valid: false, code: "not_connected", message: err.message }, 400);
    }
    throw err;
  }
}));
