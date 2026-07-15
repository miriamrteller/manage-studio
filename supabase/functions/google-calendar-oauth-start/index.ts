/**
 * google-calendar-oauth-start
 * Returns a Google OAuth consent URL for the authenticated tenant admin.
 * state is HMAC-signed (tenant + admin user + expiry) for CSRF protection.
 */
import { handleOptions, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient, requireAuthUser } from "../../packages/edge-runtime/src/supabase.ts";
import { buildAuthUrl, isGoogleMock } from "../_shared/google-calendar.ts";
import { signGoogleOAuthState } from "../_shared/google-oauth-state.ts";
import { requireFeature } from "../_shared/feature-gate.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  if (!APP_URL) {
    return jsonResponse({ error: "APP_URL is not configured on the server" }, 500);
  }

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

  let state: string;
  try {
    state = await signGoogleOAuthState(tenantId, auth.user.id);
  } catch (e) {
    console.error("[google-calendar-oauth-start] state signing failed", e);
    return jsonResponse({ error: "OAuth is not configured" }, 500);
  }

  const redirectUri = `${APP_URL}/admin/setup/integrations/google/callback`;

  // In mock mode there is no real Google client; skip the consent screen and send
  // the admin straight to our callback with a stub code so the (mocked) exchange runs.
  const url = isGoogleMock()
    ? `${redirectUri}?code=mock-code&state=${encodeURIComponent(state)}`
    : buildAuthUrl(state, redirectUri);

  return jsonResponse({ url, state });
});
