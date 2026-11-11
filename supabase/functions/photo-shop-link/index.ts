/**
 * photo-shop-link: "Send shop link" (beta, feature billing:photo_shop).
 *
 *   { action: "create", engagementId }   (studio admins)
 *     → { url, email, expiresAt } — a link to the studio's /shop/<token> page that signs
 *       the shoot's client straight in for 3 days. The studio sends it (email app,
 *       WhatsApp, copy). Only sha256(token) is stored, in photo_shop_links.
 *   { action: "open", token }   (no sign-in: the token is the credential)
 *     → { access_token, refresh_token, engagementId } — a normal session for the client's
 *       own login at this studio (made on first use, like signing in by email).
 *
 * Safety: the link only ever signs in the shoot's client, by the email on the client's
 * record. It refuses when that email belongs to a studio admin, a teacher, the platform
 * owner, or a login at another studio. What the client then sees is their own portal,
 * and the photo shop shows watermarked previews only.
 */
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { requireFeature } from "../_shared/feature-gate.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { tenantBaseUrlFor } from "../_shared/tenant-url.ts";
import { ensureClientLogin, sessionForEmail } from "../_shared/client-login.ts";

const FEATURE = "billing:photo_shop";
export const LINK_DAYS = 3;

type Service = ReturnType<typeof createServiceClient>;

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The shoot's client: tenant, email (normalised) and the studio's subdomain. */
async function shootClient(service: Service, engagementId: string) {
  const { data } = await service
    .from("engagements")
    .select("tenant_id, people:person_id(email), tenants:tenant_id(subdomain)")
    .eq("id", engagementId)
    .maybeSingle();
  if (!data) return null;
  // deno-lint-ignore no-explicit-any
  const row = data as any;
  const email = typeof row.people?.email === "string" ? row.people.email.trim().toLowerCase() : "";
  return {
    tenantId: row.tenant_id as string,
    email,
    subdomain: (row.tenants?.subdomain as string | null) ?? null,
  };
}

Deno.serve(withMonitoring("photo-shop-link", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const service = createServiceClient();

  if (body?.action === "open") {
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 100) return jsonResponse({ ok: false, code: "expired" }, 400);
    return await openLink(service, token);
  }

  if (body?.action !== "create") return jsonResponse({ error: "bad_request" }, 400);
  const engagementId = typeof body.engagementId === "string" ? body.engagementId : "";
  if (!engagementId) return jsonResponse({ error: "bad_request" }, 400);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();
  const roles = (profile?.role as string[] | null) ?? [];
  if (!profile?.tenant_id || !roles.includes("tenant_admin")) {
    return jsonResponse({ ok: false, code: "forbidden" }, 403);
  }

  const client = await shootClient(service, engagementId);
  if (!client || client.tenantId !== profile.tenant_id) return jsonResponse({ ok: false, code: "not_found" }, 404);
  try {
    await requireFeature(client.tenantId, FEATURE, service);
  } catch (res) {
    if (res instanceof Response) return jsonResponse({ ok: false, code: "feature_not_available" }, 403);
    throw res;
  }
  if (!client.email) return jsonResponse({ ok: false, code: "no_email" }, 400);

  const token = randomToken();
  const expiresAt = new Date(Date.now() + LINK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await service.from("photo_shop_links").insert({
    tenant_id: client.tenantId,
    engagement_id: engagementId,
    token_hash: await sha256Hex(token),
    created_by: auth.user.id,
    expires_at: expiresAt,
  });
  if (error) return jsonResponse({ ok: false, code: "failed" }, 500);

  const base = await tenantBaseUrlFor(service, client.tenantId);
  return jsonResponse({ ok: true, url: `${base}/shop/${token}`, email: client.email, expiresAt });
}));

async function openLink(service: Service, token: string): Promise<Response> {
  const { data: link } = await service
    .from("photo_shop_links")
    .select("id, tenant_id, engagement_id, expires_at")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (!link || new Date(link.expires_at as string).getTime() < Date.now()) {
    return jsonResponse({ ok: false, code: "expired" }, 400);
  }
  const engagementId = link.engagement_id as string;
  const client = await shootClient(service, engagementId);
  if (!client || client.tenantId !== link.tenant_id || !client.email || !client.subdomain) {
    return jsonResponse({ ok: false, code: "sign_in" }, 400);
  }

  // The client's own login at this studio (made on first visit, linked to their record so
  // the portal finds the shoot). Never a staff login, never another studio's.
  const login = await ensureClientLogin(service, { tenantId: client.tenantId, email: client.email });
  if (!login.ok) return jsonResponse({ ok: false, code: "sign_in" }, 400);
  const session = await sessionForEmail(service, client.email);
  if (!session) return jsonResponse({ ok: false, code: "sign_in" }, 400);

  await service.from("photo_shop_links").update({ last_used_at: new Date().toISOString() }).eq("id", link.id);
  return jsonResponse({
    ok: true,
    ...session,
    engagementId,
  });
}
