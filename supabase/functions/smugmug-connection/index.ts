/**
 * smugmug-connection: the photo shop's SmugMug link, with the studio's OWN API key
 * (beta, feature billing:photo_shop). Studio admins only. POST { action }:
 *   - "test":     Test connection (read-only; see testSmugMugConnection).
 *   - "start":    Connect SmugMug. Gets a request token with the fixed callback URL, keeps it
 *                 encrypted (bound to this admin, 15 minutes) and returns SmugMug's sign-in URL.
 *   - "complete": the callback page posts { oauth_token, oauth_verifier }; we swap them for
 *                 the access token and store it encrypted.
 *   - "albums":   { engagement_id? } the photographer's galleries, plus the one whose name
 *                 matches the shoot (client or service name) to prefill the picker.
 *   - "check":    { engagement_id, album_key } "Check gallery": reads the gallery's Photo
 *                 Protection settings and photos (smugmug/api.ts checkGallery) and saves the
 *                 gallery and the result on the shoot's shop.
 *   - "studio_url": { oauth_token } (no sign-in needed). SmugMug returns to the one fixed
 *                 callback on app.<root>, where the studio admin is not signed in. This finds
 *                 the studio whose pending request has this token (not expired) and returns
 *                 its own address, so the page can carry on there. Built from the tenant row.
 * Disconnect is the disconnect_tenant_smugmug RPC. Connecting alone does not open a gallery to
 * clients: each stays "provider_locked" (_shared/photo-shop/gallery.ts) until its check passes.
 */
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { requireFeature } from "../_shared/feature-gate.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { tenantBaseUrlFor } from "../_shared/tenant-url.ts";
import { getStudioSmugMug } from "../_shared/photo-shop/smugmug/credentials.ts";
import {
  authorizeUrl,
  getAccessToken,
  getRequestToken,
  PENDING_TTL_SECONDS,
  pendingMatches,
  sameString,
  SMUGMUG_CALLBACK_PATH,
  SmugMugError,
  testSmugMugConnection,
} from "../_shared/photo-shop/smugmug/oauth.ts";
import {
  checkGallery,
  listAlbums,
  smugmugReader,
  SmugMugShapeError,
  suggestAlbum,
} from "../_shared/photo-shop/smugmug/api.ts";

const FEATURE = "billing:photo_shop";
// The platform origin (https://app.opalswift.com in production): the callback is the same
// for every studio, custom domains included, because photographers register it at SmugMug.
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");

Deno.serve(withMonitoring("smugmug-connection", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: { action?: string; oauth_token?: string; oauth_verifier?: string; engagement_id?: string; album_key?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }

  const service = createServiceClient();

  if (body.action === "studio_url") {
    const oauthToken = body.oauth_token?.trim();
    if (!oauthToken) return jsonResponse({ ok: false, code: "expired" }, 400);
    const tenantId = await pendingTenantFor(service, oauthToken, Math.floor(Date.now() / 1000));
    if (!tenantId) return jsonResponse({ ok: false, code: "expired" }, 400);
    try {
      return jsonResponse({ ok: true, studio_url: await tenantBaseUrlFor(service, tenantId) });
    } catch (e) {
      console.error("[smugmug-connection] studio_url", e instanceof Error ? e.message : "failed");
      return jsonResponse({ ok: false, code: "expired" }, 404);
    }
  }

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

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

    case "albums":
    case "check": {
      if (!studio.token) return jsonResponse({ ok: false, code: "not_connected" }, 400);
      const reader = smugmugReader(studio.keys, studio.token);
      const engagementId = typeof body.engagement_id === "string" ? body.engagement_id : "";
      let shoot: { personName: string | null; serviceName: string | null } | null = null;
      if (engagementId) {
        const { data: eng } = await service
          .from("engagements")
          .select("id, tenant_id, people(name), offerings(name)")
          .eq("id", engagementId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (!eng) return jsonResponse({ ok: false, code: "not_found" }, 404);
        const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { name?: string } | null;
        shoot = { personName: one(eng.people)?.name ?? null, serviceName: one(eng.offerings)?.name ?? null };
      }
      try {
        if (body.action === "albums") {
          const albums = await listAlbums(reader);
          const suggested = shoot ? suggestAlbum(albums, [shoot.personName ?? "", shoot.serviceName ?? ""]) : null;
          return jsonResponse({ ok: true, albums, suggested });
        }
        const albumKey = typeof body.album_key === "string" ? body.album_key.trim() : "";
        if (!engagementId || !/^[A-Za-z0-9]{1,64}$/.test(albumKey)) {
          return jsonResponse({ ok: false, code: "missing_params" }, 400);
        }
        const result = await checkGallery(reader, albumKey);
        const { error } = await service.rpc("save_job_photo_shop_smugmug_check", {
          p_tenant_id: tenantId,
          p_engagement_id: engagementId,
          p_actor_id: auth.user.id,
          p_album_key: result.albumKey,
          p_album_name: result.albumName,
          p_check: { passed: result.passed, items: result.items },
          p_photos: result.passed ? result.photos : null,
        });
        if (error) throw new Error("Could not save the gallery check");
        return jsonResponse({
          ok: true,
          passed: result.passed,
          albumName: result.albumName,
          items: result.items,
          photoCount: result.photos.length,
        });
      } catch (err) {
        if (err instanceof SmugMugShapeError) return jsonResponse({ ok: false, code: err.code }, 422);
        return smugmugFailure(err, "token_rejected");
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

/**
 * The studio whose pending "Connect SmugMug" request has this request token and has not
 * expired. Only studios with a pending request are read (a handful at most). Null if none.
 */
async function pendingTenantFor(
  service: ReturnType<typeof createServiceClient>,
  oauthToken: string,
  nowSeconds: number,
): Promise<string | null> {
  const { data, error } = await service
    .from("tenants")
    .select("id")
    .not("smugmug_oauth_pending_enc", "is", null);
  if (error || !data) return null;
  for (const row of data as Array<{ id: string }>) {
    const studio = await getStudioSmugMug(service, row.id).catch(() => null);
    const pending = studio?.pending;
    if (pending && pending.exp >= nowSeconds && sameString(pending.token, oauthToken)) return row.id;
  }
  return null;
}
