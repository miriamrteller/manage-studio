/**
 * google-calendar-oauth-callback
 * Exchanges the OAuth code (POSTed by the frontend callback page with the admin's
 * Bearer token), stores encrypted tokens, and returns the connected email.
 */
import { handleOptions, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient, requireAuthUser } from "../../packages/edge-runtime/src/supabase.ts";
import { exchangeCode, fetchGoogleEmail } from "../_shared/google-calendar.ts";
import { verifyGoogleOAuthState } from "../_shared/google-oauth-state.ts";
import { requireFeature } from "../_shared/feature-gate.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  let body: { code?: string; state?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }
  if (!body.code || !body.state) return jsonResponse({ error: "code and state are required" }, 400);

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

  const statePayload = await verifyGoogleOAuthState(body.state, tenantId, auth.user.id);
  if (!statePayload) {
    return jsonResponse({ error: "Invalid or expired state" }, 400);
  }

  const redirectUri = `${APP_URL}/admin/setup/integrations/google/callback`;

  try {
    const tokens = await exchangeCode(body.code, redirectUri);
    const email = await fetchGoogleEmail(tokens.accessToken);

    const { error } = await service.rpc("save_tenant_google_credentials", {
      p_tenant_id: tenantId,
      p_refresh_token: tokens.refreshToken,
      p_access_token: tokens.accessToken,
      p_expires_at: tokens.expiresAt,
      p_email: email,
      p_calendar_id: "primary",
    });
    if (error) throw new Error(error.message ?? "Failed to save Google credentials");

    return jsonResponse({ ok: true, email });
  } catch (e) {
    console.error("[google-calendar-oauth-callback]", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "OAuth failed" }, 500);
  }
});
