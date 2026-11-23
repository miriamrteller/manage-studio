/**
 * client-photo-shop
 *
 * The client's photo shop for one shoot (beta, feature billing:photo_shop).
 *   { action: "gallery", engagementId }
 *     → { shop, photos: [{ key, fileName, previewUrl }] }
 *   { action: "order", engagementId, imageKeys: string[], allPhotos?: boolean, payBy?: "card" | "cash" | "direct",
 *     products?: [{ imageKey, productId }] }
 *       products: prints and other products the studio sells, one line each, priced in the
 *       database. An order may hold products only (imageKeys empty).
 *     → { orderId, status, totalMinor, currency, payToken, payByCash }
 *       payBy "cash": the order is sent in to pay the studio in cash. It waits for
 *       payment (the pay link still works) and the studio is emailed at once.
 *       When the studio switched on ways to pay it directly (Settings > Payment > Photo
 *       shop), paymentPage is true: the client goes on to the order's payment page and is
 *       emailed the ways and its link. Bit / bank transfer ask for a payment screenshot.
 *   { action: "payment", engagementId, orderId }
 *     → { studioName, order, pay_direct, card_payments } — the order's payment page.
 *   { action: "method", engagementId, orderId, method: "bit" | "bank" | "cash" | "cheque" }
 *     → { ok } — the way the client picked on the payment page (cash / cheque: no screenshot).
 *   { action: "proof", engagementId, orderId, image: base64, method?: "bit" | "bank" }
 *     → { ok, proofSentAt } — the client's payment screenshot (PNG, JPEG or WebP, up to
 *       5 MB) for their own Bit / bank transfer order. Saved on the order (private bucket
 *       photo-order-proofs) and the studio is emailed. The order itself is unchanged.
 *   { action: "preview", engagementId }   (studio admins only)
 *     → { shop, photos, sample } — what the shoot's client sees. While the shoot's gallery
 *       is not ready (none chosen, or SmugMug still locked) the photos are the sample
 *       gallery and sample is true. Never orders anything.
 *
 * Authorization: Bearer <supabase session> (the shoot's client, or a studio
 * admin previewing). Access is decided by get_client_photo_shop() running as
 * the caller; only then does the service role read the gallery and place the
 * order. Photos and file names come from the gallery, never from the request,
 * and prices are worked out in the database.
 *
 * A SmugMug gallery answers "provider_locked" until its "Check gallery" has passed
 * (see _shared/photo-shop/gallery.ts); then clients and the studio's preview see its
 * watermarked photos.
 */
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { getTenantFeatures } from "../_shared/feature-gate.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import {
  checkedSmugMugPhotos,
  GalleryNotReadyError,
  listGalleryPhotos,
  mockGalleryPhotos,
  uploadedPhotoSource,
} from "../_shared/photo-shop/gallery.ts";
import { refreshGalleryLinks, type SmugMugConnection } from "../_shared/photo-shop/smugmug/refresh.ts";
import { orderPersonId, photoOrderLabel, resolveOrderItems, resolveProductItems } from "../_shared/photo-shop/order-items.ts";
import {
  notifyClientPhotoOrderPayDirect,
  notifyStudioPhotoOrderCash,
  notifyStudioPhotoOrderPaid,
  notifyStudioPhotoOrderProof,
} from "../_shared/photo-shop/emails.ts";
import { decodeProof, detectProofImageType, PROOF_BUCKET, PROOF_EXTENSION } from "../_shared/photo-shop/payment-proof.ts";
import {
  asksForProof,
  isPayDirectMethod,
  PROOF_METHODS,
  studioPayDirect,
} from "../_shared/photo-shop/pay-direct.ts";

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
    if (!engagementId || (action !== "gallery" && action !== "order" && action !== "preview" && action !== "proof" && action !== "payment" && action !== "method")) {
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
      .select("tenant_id, provider, gallery_key, smugmug_check, smugmug_photos, smugmug_checked_at, smugmug_photos_refreshed_at")
      .eq("engagement_id", engagementId)
      .maybeSingle();
    if (!shopRow || !view.has_shop) {
      return jsonResponse({ error: action === "preview" ? "no_shop" : "no_gallery" }, 409);
    }

    const gallery = {
      provider: shopRow.provider as string,
      gallery_key: shopRow.gallery_key as string,
      smugmug_check: shopRow.smugmug_check,
      smugmug_photos: shopRow.smugmug_photos,
      smugmug_checked_at: shopRow.smugmug_checked_at as string | null,
    };
    const uploads = uploadedPhotoSource(service);

    const features = await getTenantFeatures(shopRow.tenant_id as string, service);
    if (!features.has(FEATURE)) return jsonResponse({ error: "feature_not_available" }, 403);

    // ── the order's payment page: the studio's Bit / bank transfer details ──
    // Read only; the client's own orders only (get_client_photo_shop let them in above).
    if (action === "payment") {
      const orderId = typeof body?.orderId === "string" ? body.orderId : "";
      const orders = Array.isArray(view.orders) ? (view.orders as Array<Record<string, unknown>>) : [];
      const mine = orders.find((o) => o.id === orderId);
      if (!mine) return jsonResponse({ error: "not_found" }, 404);
      const [{ data: proofRow }, { data: settings }, pay, { data: studio }] = await Promise.all([
        service.from("job_photo_orders").select("pay_method, proof_requested, proof_sent_at").eq("id", orderId).maybeSingle(),
        service.from("tenant_photo_shop_settings").select("card_payments")
          .eq("tenant_id", shopRow.tenant_id as string).maybeSingle(),
        studioPayDirect(service, shopRow.tenant_id as string),
        service.from("tenants").select("name").eq("id", shopRow.tenant_id as string).maybeSingle(),
      ]);
      return jsonResponse({
        studioName: (studio?.name as string | undefined) ?? "",
        order: {
          ...mine,
          pay_method: proofRow?.pay_method ?? null,
          proof_requested: proofRow?.proof_requested === true,
          proof_sent_at: proofRow?.proof_sent_at ?? null,
        },
        pay_direct: pay,
        card_payments: (settings as { card_payments?: boolean } | null)?.card_payments === true,
      });
    }

    // ── the client picks cash or cheque on the payment page: no screenshot needed ──
    if (action === "method") {
      const orderId = typeof body?.orderId === "string" ? body.orderId : "";
      const method = body?.method;
      const personId = await orderPersonId(auth.supabase, service, engagementId);
      if (!orderId || !personId || !isPayDirectMethod(method)) return jsonResponse({ error: "bad_request" }, 400);
      const { data: target } = await service
        .from("job_photo_orders")
        .select("id, status, pay_by_cash")
        .eq("id", orderId)
        .eq("engagement_id", engagementId)
        .eq("person_id", personId)
        .maybeSingle();
      if (!target || target.pay_by_cash !== true) return jsonResponse({ error: "not_found" }, 404);
      if (target.status !== "awaiting_payment") return jsonResponse({ error: "already_paid" }, 409);
      // Bit / bank transfer keep asking for the screenshot; cash / cheque stop the reminders.
      const { error: saveError } = await service
        .from("job_photo_orders")
        .update({ pay_method: method, ...(PROOF_METHODS.includes(method) ? {} : { proof_requested: false }) })
        .eq("id", orderId);
      if (saveError) return jsonResponse({ error: "server_error" }, 500);
      return jsonResponse({ ok: true });
    }

    // ── payment screenshot for an order paid by Bit / bank transfer ─────────
    // Saved on the order; the studio is emailed. Never changes the order's status.
    if (action === "proof") {
      const orderId = typeof body?.orderId === "string" ? body.orderId : "";
      const personId = await orderPersonId(auth.supabase, service, engagementId);
      if (!orderId || !personId) return jsonResponse({ error: "not_found" }, 404);
      const { data: target } = await service
        .from("job_photo_orders")
        .select("id, tenant_id, status, pay_by_cash, proof_path")
        .eq("id", orderId)
        .eq("engagement_id", engagementId)
        .eq("person_id", personId)
        .maybeSingle();
      if (!target || target.pay_by_cash !== true) return jsonResponse({ error: "not_found" }, 404);
      if (target.status !== "awaiting_payment") return jsonResponse({ error: "already_paid" }, 409);
      const bytes = decodeProof(body?.image);
      if (!bytes) return jsonResponse({ error: "proof_too_big" }, 413);
      const type = detectProofImageType(bytes);
      if (!type) return jsonResponse({ error: "proof_not_image" }, 422);
      const path = `${target.tenant_id}/${orderId}/${crypto.randomUUID()}.${PROOF_EXTENSION[type]}`;
      const { error: upError } = await service.storage.from(PROOF_BUCKET).upload(path, bytes, {
        contentType: type,
        upsert: false,
      });
      if (upError) {
        console.error("[client-photo-shop] proof upload failed", upError.message);
        return jsonResponse({ error: "server_error" }, 500);
      }
      const sentAt = new Date().toISOString();
      const method = isPayDirectMethod(body?.method) && PROOF_METHODS.includes(body.method) ? body.method : null;
      const { error: saveError } = await service
        .from("job_photo_orders")
        .update({ proof_path: path, proof_sent_at: sentAt, proof_requested: true, ...(method ? { pay_method: method } : {}) })
        .eq("id", orderId);
      if (saveError) {
        await service.storage.from(PROOF_BUCKET).remove([path]);
        return jsonResponse({ error: "server_error" }, 500);
      }
      // A new screenshot replaces the old one.
      if (typeof target.proof_path === "string" && target.proof_path) {
        await service.storage.from(PROOF_BUCKET).remove([target.proof_path]).catch(() => undefined);
      }
      await notifyStudioPhotoOrderProof(service, orderId).catch((e) =>
        console.error("[client-photo-shop] studio proof email failed", e)
      );
      return jsonResponse({ ok: true, proofSentAt: sentAt });
    }

    // A checked SmugMug gallery: fresh preview links from SmugMug instead of only the ones
    // saved at the check (they can stop opening). "refresh": none of the links loaded.
    let smugmugConnection: SmugMugConnection = "unknown";
    if (action !== "order" && checkedSmugMugPhotos(gallery)) {
      const times = [shopRow.smugmug_checked_at, shopRow.smugmug_photos_refreshed_at]
        .filter((t): t is string => typeof t === "string")
        .sort();
      const refreshed = await refreshGalleryLinks(service, {
        tenantId: shopRow.tenant_id as string,
        engagementId,
        galleryKey: gallery.gallery_key,
        savedPhotos: gallery.smugmug_photos,
        lastRefreshedAt: times.length ? times[times.length - 1] : null,
        force: body?.refresh === true,
      });
      if (refreshed.photos) gallery.smugmug_photos = refreshed.photos;
      smugmugConnection = refreshed.connection;
    }

    // Card payments are off until the studio switches them on (Settings > Payment > Photo
    // shop): clients then only pay the studio directly.
    const [{ data: shopSettings }, payDirect] = await Promise.all([
      service
        .from("tenant_photo_shop_settings")
        .select("card_payments")
        .eq("tenant_id", shopRow.tenant_id as string)
        .maybeSingle(),
      // How to pay the studio directly (Settings > Online payments, the same for every checkout).
      studioPayDirect(service, shopRow.tenant_id as string),
    ]);
    const cardPayments = shopSettings?.card_payments === true;
    const shopView = {
      ...view,
      card_payments: cardPayments,
      pay_direct: payDirect,
    };

    if (action === "preview") {
      const { data: profile } = await service
        .from("user_profiles")
        .select("tenant_id, role")
        .eq("id", auth.user.id)
        .maybeSingle();
      const roles = (profile?.role as string[] | null) ?? [];
      if (profile?.tenant_id !== shopRow.tenant_id || !roles.includes("tenant_admin")) {
        return jsonResponse({ error: "not_found" }, 404);
      }
      try {
        const real = await listGalleryPhotos(gallery, { uploads, adminPreview: true });
        return jsonResponse({ shop: shopView, photos: real, sample: false, smugmugConnection });
      } catch (e) {
        if (!(e instanceof GalleryNotReadyError)) throw e;
        // Sample photos only: nothing real is shown until the shoot's gallery is ready.
        return jsonResponse({ shop: shopView, photos: mockGalleryPhotos(engagementId), sample: true });
      }
    }

    let photos;
    try {
      photos = await listGalleryPhotos(gallery, { uploads });
    } catch (e) {
      if (e instanceof GalleryNotReadyError) return jsonResponse({ error: e.code }, 409);
      throw e;
    }

    if (action === "gallery") {
      // Which orders wait for a payment screenshot (Bit / bank transfer) and which have one.
      const orders = Array.isArray(view.orders) ? (view.orders as Array<Record<string, unknown>>) : [];
      const ids = orders.map((o) => o.id).filter((id): id is string => typeof id === "string");
      const { data: proofRows } = ids.length
        ? await service.from("job_photo_orders").select("id, pay_method, proof_requested, proof_sent_at").in("id", ids)
        : { data: [] };
      const proofById = new Map((proofRows ?? []).map((r) => [r.id as string, r]));
      const withProof = orders.map((o) => {
        const r = proofById.get(o.id as string);
        return {
          ...o,
          pay_method: r?.pay_method ?? null,
          proof_requested: r?.proof_requested === true,
          proof_sent_at: r?.proof_sent_at ?? null,
        };
      });
      return jsonResponse({ shop: { ...shopView, orders: withProof }, photos });
    }

    // ── place an order ──────────────────────────────────────────────────────
    if (!view.open) return jsonResponse({ error: "shop_closed" }, 409);

    // Who the order is for. get_client_photo_shop above already let this caller in (the
    // shoot's client, or a member of their family account). A family-account login is linked
    // through account_members, not people.user_profile_id, so get_my_person_id can be empty:
    // then the order is the shoot's own client's (13 Nov 2026: a cash order was refused).
    const personId = await orderPersonId(auth.supabase, service, engagementId);
    if (!personId) return jsonResponse({ error: "not_this_client" }, 403);

    const taken = [...(view.bought_image_keys ?? []), ...(view.awaiting_image_keys ?? [])];
    // The person's own unpaid card cart is replaced by this one, so its photos are free to pick
    // again. An order sent in to pay in cash is kept, so its photos stay taken.
    const { data: ownAwaiting } = await service
      .from("job_photo_order_items")
      .select("image_key, job_photo_orders!inner(person_id, status)")
      .eq("engagement_id", engagementId)
      .is("voided_at", null)
      .eq("job_photo_orders.person_id", personId)
      .eq("job_photo_orders.status", "awaiting_payment")
      .eq("job_photo_orders.pay_by_cash", false);
    const mine = new Set((ownAwaiting ?? []).map((r) => r.image_key as string));

    const products = resolveProductItems(photos, body?.products);
    if (!products.ok) return jsonResponse({ error: products.error }, 422);
    // Products only (no digital file picked): no digital items to check.
    const requestedKeys = body?.imageKeys;
    const productsOnly = body?.allPhotos !== true && products.items.length > 0 &&
      Array.isArray(requestedKeys) && requestedKeys.length === 0;
    const resolved = productsOnly
      ? { ok: true as const, items: [] as { image_key: string; file_name: string }[] }
      : resolveOrderItems(
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

    // Paying the studio directly while it has Bit / bank transfer details: the client goes on
    // to the payment page, picks one, pays and sends a screenshot (owner, 22 Nov 2026).
    const wantsDirect = body?.payBy === "cash" || body?.payBy === "direct" || body?.payBy === "bit" ||
      body?.payBy === "bank";
    const payByCash = wantsDirect || !cardPayments;
    // A payment page whenever the studio switched on ways to pay it directly; a screenshot is
    // asked for when one of them is Bit or bank transfer (cash / cheque just confirm).
    const paymentPage = payByCash && payDirect !== null;
    const proofRequested = paymentPage && asksForProof(payDirect);
    const { data: order, error: orderError } = await service.rpc("create_job_photo_order", {
      p_engagement_id: engagementId,
      p_person_id: personId,
      p_items: resolved.items,
      p_all_photos: body?.allPhotos === true,
      p_label: photoOrderLabel(resolved.items.length, language, products.items.length),
      p_pay_by_cash: payByCash,
      p_products: products.items,
    });
    if (orderError || !order) {
      const code = orderErrorCode(orderError?.message ?? "");
      return jsonResponse({ error: code }, code === "order_failed" ? 500 : 409);
    }
    const o = order as Record<string, unknown>;
    // Ask for the payment screenshot on this order: the reminders follow it.
    if (proofRequested && o.pay_by_cash === true && o.status === "awaiting_payment") {
      await service.from("job_photo_orders").update({ proof_requested: true }).eq("id", o.order_id as string);
    }
    // Free orders are paid at once; paid ones email the studio when the payment lands.
    if (o.status === "paid") {
      await notifyStudioPhotoOrderPaid(service, o.order_id as string).catch((e) =>
        console.error("[client-photo-shop] studio email failed", e)
      );
    } else if (o.pay_by_cash === true) {
      // Sent in to pay in cash: the studio hears now, not only when the cash is recorded.
      await notifyStudioPhotoOrderCash(service, o.order_id as string, paymentPage ? payDirect : null).catch((e) =>
        console.error("[client-photo-shop] studio email failed", e)
      );
      // Bit / bank transfer: the client gets the details and the payment page link by email too.
      if (paymentPage && payDirect) {
        await notifyClientPhotoOrderPayDirect(service, o.order_id as string, payDirect).catch((e) =>
          console.error("[client-photo-shop] client email failed", e)
        );
      }
    }
    return jsonResponse({
      orderId: o.order_id,
      status: o.status,
      totalMinor: o.total_minor,
      currency: o.currency,
      payToken: o.pay_token ?? null,
      payByCash: o.pay_by_cash === true,
      paymentPage: paymentPage && o.pay_by_cash === true && o.status === "awaiting_payment",
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[client-photo-shop]", e);
    return jsonResponse({ error: "server_error" }, 500);
  }
}));
