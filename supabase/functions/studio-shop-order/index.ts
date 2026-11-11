/**
 * studio-shop-order
 *
 * The studio moves a paid shop order on (beta, feature billing:studio_shop).
 *   { orderId, status: "ready" | "collected" } → { status, emailed }
 * "ready" emails the family that the order is ready to collect (once).
 *
 * Authorization: Bearer <supabase session> of a studio admin. The change runs
 * as the caller through set_shop_order_status(), which refuses anyone who is
 * not the order's studio admin; only then does the service role send the email.
 */
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { notifyFamilyShopOrderReady } from "../_shared/studio-shop/emails.ts";

Deno.serve(withMonitoring("studio-shop-order", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireAuthUser(req);
    if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    const status = body?.status;
    if (!orderId || (status !== "ready" && status !== "collected")) {
      return jsonResponse({ error: "bad_request" }, 400);
    }

    const { data, error } = await auth.supabase.rpc("set_shop_order_status", {
      p_order_id: orderId,
      p_status: status,
    });
    if (error) {
      const m = /set_shop_order_status: (\w+)/.exec(error.message);
      const code = m ? m[1] : "failed";
      return jsonResponse({ error: code }, code === "not_found" ? 404 : code === "failed" ? 500 : 409);
    }

    let emailed = false;
    if (data === "ready") {
      // The order is ready either way; a failed email is logged, never undoes it.
      emailed = await notifyFamilyShopOrderReady(createServiceClient(), orderId).catch((e) => {
        console.error("[studio-shop-order] family email failed", e);
        return false;
      });
    }
    return jsonResponse({ status: data, emailed });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[studio-shop-order]", e);
    return jsonResponse({ error: "server_error" }, 500);
  }
}));
