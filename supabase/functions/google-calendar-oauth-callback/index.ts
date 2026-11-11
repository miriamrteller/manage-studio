/**
 * google-calendar-oauth-callback
 * Exchanges the OAuth code (POSTed by the frontend callback page with the admin's
 * Bearer token), stores encrypted tokens, and returns the connected email.
 *
 * { action: "studio_url", state } (no sign-in needed): Google always returns to the one
 * registered address on app.<root>, where the studio admin is not signed in. This
 * returns the address of the studio the signed state was made for, so the page can
 * carry on there. The URL is built from the tenant row, never from the request.
 */
import { handleOptions, jsonResponse, internalError } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { exchangeCode, fetchGoogleEmail } from "../_shared/google-calendar.ts";
import { googleOAuthStateTenant, verifyGoogleOAuthState } from "../_shared/google-oauth-state.ts";
import { tenantBaseUrlFor } from "../_shared/tenant-url.ts";
import { requireFeature } from "../_shared/feature-gate.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

// The ONLY legitimate use of APP_URL: Google requires the redirect_uri to match
// EXACTLY the one registered, so it must be a single concrete platform origin —
// never a tenant host and never a wildcard. Parent-facing links use
// tenantBaseUrl(subdomain). See _shared/tenant-url.ts.
const APP_URL = Deno.env.get("APP_URL") ?? "";

Deno.serve(withMonitoring("google-calendar-oauth-callback", async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: { action?: string; code?: string; state?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }

  if (body.action === "studio_url") {
    const tid = body.state ? await googleOAuthStateTenant(body.state) : null;
    if (!tid) return jsonResponse({ error: "Invalid or expired state" }, 400);
    try {
      const studioUrl = await tenantBaseUrlFor(createServiceClient(), tid);
      return jsonResponse({ studio_url: studioUrl });
    } catch (e) {
      console.error("[google-calendar-oauth-callback] studio_url", e);
      return jsonResponse({ error: "Studio not found" }, 404);
    }
  }

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);
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
    return internalError("google-calendar-oauth-callback", e);
  }
}));
