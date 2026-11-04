/**
 * deliver-photo-order
 *
 * Studio admin presses Send on a paid photo order: saves the download link
 * (deliver_job_photo_order, run as the admin, which checks the role, the
 * order's state and that the link is https) and emails the client.
 *
 * Authorization: Bearer <supabase session> (studio admin)
 * Body: { orderId, deliveryUrl }
 * Response: { delivered: true, emailed: boolean }
 */
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { notifyClientPhotoOrderDelivered } from "../_shared/photo-shop/emails.ts";

Deno.serve(withMonitoring("deliver-photo-order", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireAuthUser(req);
    if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

    const body = (await req.json().catch(() => null)) as { orderId?: unknown; deliveryUrl?: unknown } | null;
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    const deliveryUrl = typeof body?.deliveryUrl === "string" ? body.deliveryUrl.trim() : "";
    if (!orderId || !deliveryUrl) return jsonResponse({ error: "bad_request" }, 400);

    const { error } = await auth.supabase.rpc("deliver_job_photo_order", {
      p_order_id: orderId,
      p_delivery_url: deliveryUrl,
    });
    if (error) {
      const message = error.message ?? "";
      const status = /access denied/.test(message) ? 403 : /not found/.test(message) ? 404 : 409;
      return jsonResponse({ error: message.replace(/^deliver_job_photo_order: /, "") }, status);
    }

    let emailed = false;
    try {
      emailed = await notifyClientPhotoOrderDelivered(createServiceClient(), orderId);
    } catch (e) {
      console.error("[deliver-photo-order] client email failed", e);
    }
    return jsonResponse({ delivered: true, emailed });
  } catch (e) {
    console.error("[deliver-photo-order]", e);
    return jsonResponse({ error: "server_error" }, 500);
  }
}));
