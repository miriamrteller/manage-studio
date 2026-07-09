/**
 * google-calendar-oauth-start
 * Returns a Google OAuth consent URL for the authenticated tenant admin.
 * state = base64(tenant_id + nonce) for CSRF protection on the callback.
 */
import { handleOptions, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient, requireAuthUser } from "../../packages/edge-runtime/src/supabase.ts";
import { buildAuthUrl } from "../_shared/google-calendar.ts";
import { requireFeature } from "../_shared/feature-gate.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();

  const tenantId = profile?.tenant_id as string | undefined;
  const roles = (profile?.role as string[] | null) ?? [];
  if (!tenantId || !roles.includes("tenant_admin")) {
    return jsonResponse({ error: "Admin access required" }, 403);
  }

  try {
    await requireFeature(tenantId, "scheduling:integration.google_calendar", service);
  } catch (res) {
    if (res instanceof Response) return jsonResponse({ error: "feature_not_available" }, 403);
    throw res;
  }

  const nonce = crypto.randomUUID();
  const state = btoa(JSON.stringify({ tenant_id: tenantId, nonce }));
  const redirectUri = `${APP_URL}/admin/setup/integrations/google/callback`;
  const url = buildAuthUrl(state, redirectUri);

  return jsonResponse({ url, state });
});
