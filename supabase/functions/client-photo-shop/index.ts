/**
 * client-photo-shop
 *
 * The client's photo shop for one shoot (beta, feature billing:photo_shop).
 *   { action: "gallery", engagementId }
 *     → { shop, photos: [{ key, fileName, previewUrl }] }
 *   { action: "order", engagementId, imageKeys: string[], allPhotos?: boolean }
 *     → { orderId, status, totalMinor, currency, payToken }
 *
 * Authorization: Bearer <supabase session> (the shoot's client, or a studio
 * admin previewing). Access is decided by get_client_photo_shop() running as
 * the caller; only then does the service role read the gallery and place the
 * order. Photos and file names come from the gallery, never from the request,
 * and prices are worked out in the database.
 *
 * SmugMug galleries answer "provider_locked" until the live watermark check
 * passes (see _shared/photo-shop/gallery.ts).
 */
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { getTenantFeatures } from "../_shared/feature-gate.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { GalleryNotReadyError, listGalleryPhotos } from "../_shared/photo-shop/gallery.ts";
import { photoOrderLabel, resolveOrderItems } from "../_shared/photo-shop/order-items.ts";

const FEATURE = "billing:photo_shop";

interface ClientShop {
  engagement_id: string;
  has_shop: boolean;
  open?: boolean;
  bought_image_keys?: string[];
  awaiting_image_keys?: string[];
  [key: string]: unknown;
}

/** Database errors raised as "create_job_photo_order: <code>" → a stable code for the page. */
function orderErrorCode(message: string): string {
  const m = /create_job_photo_order: (\w+)/.exec(message);
  return m ? m[1] : "order_failed";
}

Deno.serve(withMonitoring("client-photo-shop", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireAuthUser(req);
    if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const action = body?.action;
    const engagementId = typeof body?.engagementId === "string" ? body.engagementId : "";
    if (!engagementId || (action !== "gallery" && action !== "order")) {
      return jsonResponse({ error: "bad_request" }, 400);
    }

    // Runs as the caller: refuses anyone who is not this shoot's client or the studio's admin.
    const { data: clientShop, error: shopError } = await auth.supabase.rpc("get_client_photo_shop", {
      p_engagement_id: engagementId,
    });
    if (shopError || !clientShop) return jsonResponse({ error: "not_found" }, 404);
    const view = clientShop as ClientShop;

    const service = createServiceClient();
    const { data: shopRow } = await service
      .from("job_photo_shops")
      .select("tenant_id, provider, gallery_key")
      .eq("engagement_id", engagementId)
      .maybeSingle();
    if (!shopRow || !view.has_shop) return jsonResponse({ error: "no_gallery" }, 409);

    const features = await getTenantFeatures(shopRow.tenant_id as string, service);
    if (!features.has(FEATURE)) return jsonResponse({ error: "feature_not_available" }, 403);

    let photos;
    try {
      photos = await listGalleryPhotos({ provider: shopRow.provider as string, gallery_key: shopRow.gallery_key as string });
    } catch (e) {
      if (e instanceof GalleryNotReadyError) return jsonResponse({ error: e.code }, 409);
      throw e;
    }

    if (action === "gallery") {
      return jsonResponse({ shop: view, photos });
    }

    // ── place an order ──────────────────────────────────────────────────────
    if (!view.open) return jsonResponse({ error: "shop_closed" }, 409);

    const { data: personId } = await auth.supabase.rpc("get_my_person_id");
    if (typeof personId !== "string") return jsonResponse({ error: "not_this_client" }, 403);

    const taken = [...(view.bought_image_keys ?? []), ...(view.awaiting_image_keys ?? [])];
    // The person's own unpaid cart is replaced by this one, so its photos are free to pick again.
    const { data: ownAwaiting } = await service
      .from("job_photo_order_items")
      .select("image_key, job_photo_orders!inner(person_id, status)")
      .eq("engagement_id", engagementId)
      .is("voided_at", null)
      .eq("job_photo_orders.person_id", personId)
      .eq("job_photo_orders.status", "awaiting_payment");
    const mine = new Set((ownAwaiting ?? []).map((r) => r.image_key as string));

    const resolved = resolveOrderItems(
      photos,
      body?.imageKeys,
      taken.filter((k) => !mine.has(k)),
      body?.allPhotos === true,
    );
    if (!resolved.ok) return jsonResponse({ error: resolved.error }, 422);

    const { data: tenant } = await service
      .from("tenants")
      .select("language_default")
      .eq("id", shopRow.tenant_id as string)
      .maybeSingle();
    const language = tenant?.language_default === "en" ? "en" : "he";

    const { data: order, error: orderError } = await service.rpc("create_job_photo_order", {
      p_engagement_id: engagementId,
      p_person_id: personId,
      p_items: resolved.items,
      p_all_photos: body?.allPhotos === true,
      p_label: photoOrderLabel(resolved.items.length, language),
    });
    if (orderError || !order) {
      const code = orderErrorCode(orderError?.message ?? "");
      return jsonResponse({ error: code }, code === "order_failed" ? 500 : 409);
    }
    const o = order as Record<string, unknown>;
    return jsonResponse({
      orderId: o.order_id,
      status: o.status,
      totalMinor: o.total_minor,
      currency: o.currency,
      payToken: o.pay_token ?? null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[client-photo-shop]", e);
    return jsonResponse({ error: "server_error" }, 500);
  }
}));
