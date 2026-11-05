/**
 * smugmug-connection: the photo shop's SmugMug link, with the studio's OWN API key
 * (beta, feature billing:photo_shop). Studio admins only. POST { action }:
 *   - "test":     Test connection (read-only; see testSmugMugConnection).
 *   - "start":    Connect SmugMug. Gets a request token with the fixed callback URL, keeps it
 *                 encrypted (bound to this admin, 15 minutes) and returns SmugMug's sign-in URL.
 *   - "complete": the callback page posts { oauth_token, oauth_verifier }; we swap them for
 *                 the access token and store it encrypted.
 * Disconnect is the disconnect_tenant_smugmug RPC. Connecting does NOT open the shop to
 * clients: galleries stay "provider_locked" (_shared/photo-shop/gallery.ts) until the live check.
 */
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { requireFeature } from "../_shared/feature-gate.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { getStudioSmugMug } from "../_shared/photo-shop/smugmug/credentials.ts";
import {
  authorizeUrl,
  getAccessToken,
  getRequestToken,
  PENDING_TTL_SECONDS,
  pendingMatches,
  SMUGMUG_CALLBACK_PATH,
  SmugMugError,
  testSmugMugConnection,
} from "../_shared/photo-shop/smugmug/oauth.ts";

const FEATURE = "billing:photo_shop";
// The platform origin (https://app.opalswift.com in production): the callback is the same
// for every studio, custom domains included, because photographers register it at SmugMug.
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");

Deno.serve(withMonitoring("smugmug-connection", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  let body: { action?: string; oauth_token?: string; oauth_verifier?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();
  const tenantId = profile?.tenant_id as string | undefined;
  if (!tenantId) return jsonResponse({ error: "Profile not found" }, 404);
  if (!Array.isArray(profile?.role) || !profile.role.includes("tenant_admin")) {
    return jsonResponse({ error: "tenant_admin role required" }, 403);
  }
  try {
    await requireFeature(tenantId, FEATURE, service);
  } catch (res) {
    if (res instanceof Response) return jsonResponse({ error: "feature_not_available" }, 403);
    throw res;
  }

  const studio = await getStudioSmugMug(service, tenantId);
  if (!studio) return jsonResponse({ ok: false, code: "no_keys" }, 400);

  switch (body.action) {
    case "test": {
      const result = await testSmugMugConnection(studio.keys, studio.token);
      return jsonResponse(result, 200);
    }

    case "start": {
      if (!APP_URL) return jsonResponse({ ok: false, code: "not_configured" }, 500);
      try {
        const request = await getRequestToken(studio.keys, `${APP_URL}${SMUGMUG_CALLBACK_PATH}`);
        const pending = {
          token: request.token,
          secret: request.secret,
          uid: auth.user.id,
          exp: Math.floor(Date.now() / 1000) + PENDING_TTL_SECONDS,
        };
        const { error } = await service.rpc("set_tenant_smugmug_oauth_pending", {
          p_tenant_id: tenantId,
          p_pending: JSON.stringify(pending),
        });
        if (error) throw new Error("Could not save the SmugMug request");
        return jsonResponse({ ok: true, url: authorizeUrl(request.token) });
      } catch (err) {
        return smugmugFailure(err, "keys_rejected");
      }
    }

    case "complete": {
      const oauthToken = body.oauth_token?.trim();
      const verifier = body.oauth_verifier?.trim();
      if (!oauthToken || !verifier) return jsonResponse({ ok: false, code: "missing_params" }, 400);
      const pending = studio.pending;
      if (!pending || !pendingMatches(pending, oauthToken, auth.user.id, Math.floor(Date.now() / 1000))) {
        return jsonResponse({ ok: false, code: "expired" }, 400);
      }
      try {
        const access = await getAccessToken(studio.keys, { token: pending.token, secret: pending.secret }, verifier);
        const { error } = await service.rpc("save_tenant_smugmug_access_token", {
          p_tenant_id: tenantId,
          p_actor_id: auth.user.id,
          p_access_token: access.token,
          p_access_secret: access.secret,
        });
        if (error) throw new Error("Could not save the SmugMug connection");
        return jsonResponse({ ok: true });
      } catch (err) {
        await service.rpc("set_tenant_smugmug_oauth_pending", { p_tenant_id: tenantId, p_pending: null });
        return smugmugFailure(err, "refused");
      }
    }

    default:
      return jsonResponse({ error: "Unknown action" }, 400);
  }
}));

function smugmugFailure(err: unknown, rejectedCode: string): Response {
  if (err instanceof SmugMugError) {
    if (err.status === 0) return jsonResponse({ ok: false, code: "unreachable" }, 502);
    if (err.rejected) return jsonResponse({ ok: false, code: rejectedCode }, 400);
    return jsonResponse({ ok: false, code: "failed" }, 502);
  }
  console.error("[smugmug-connection]", err instanceof Error ? err.message : "error");
  return jsonResponse({ ok: false, code: "failed" }, 500);
}
