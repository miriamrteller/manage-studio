/**
 * studio-shop-checkout
 *
 * The public Shop page's checkout (beta, feature billing:studio_shop). Anyone can buy,
 * signed in or not, and collects at the studio (owner, 22 Nov 2026).
 *   { subdomain, name, email, phone?, lines: [{ variant_id, quantity }], payBy: "card" | "studio",
 *     captchaToken?, website? (honeypot), elapsedMs? }
 *     couponCode? (optional: comes off the order; a code that doesn't work never stops it)
 *   → { ok: true, orderId, payToken?, totalMinor, coupon? }   payToken only for card: the usual
 *     /pay/:token page. totalMinor is what is paid, after any discount.
 *   → { error: code }                     sold_out, item_not_found, switched_off, ...
 *
 * The buyer is the studio's client with that email, or a new client (place_guest_shop_order).
 * The order is paid through the studio's hidden shop record, so payments, receipts and
 * Finance work as they do for every other order. "Pay the studio directly" orders are sent
 * in and the studio records the payment. The buyer gets a login (no email sent), so they can
 * sign in to see their orders. Emails: the buyer (pay link or how to pay), and the studio
 * when the buyer pays directly. No email, login or rate-limit failure ever stops an order.
 */
import { z } from "npm:zod@4.6.7";
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { checkAndIncrementAttempt, normaliseContactPoint } from "../_shared/rate-limit.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { leadCaptchaPasses } from "../_shared/crm-contract/lead-capture-guard.ts";
import { ensureClientLogin } from "../_shared/client-login.ts";
import { rememberClientLanguage } from "../_shared/resolve-email-language.ts";
import { notifyBuyerShopOrderPlaced, notifyStudioShopOrderSentIn } from "../_shared/studio-shop/emails.ts";
import { applyRequestCoupon, type ClassCouponResult } from "../_shared/payments/class-coupon.ts";

const BodySchema = z.object({
  subdomain: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(320),
  phone: z.string().trim().max(40).nullable().optional(),
  lines: z
    .array(z.object({ variant_id: z.string().guid(), quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(50),
  payBy: z.enum(["card", "studio"]),
  captchaToken: z.string().max(4000).nullable().optional(),
  website: z.string().max(200).nullable().optional(),
  elapsedMs: z.number().nonnegative().optional(),
  couponCode: z.string().trim().max(80).nullable().optional(),
  /** The language the buyer's browser was in; emails to them use it. */
  clientLanguage: z.enum(["en", "he"]).nullable().optional(),
});

/** Database errors raised as "place_shop_order: <code>" → a stable code for the page. */
function orderErrorCode(message: string): string {
  const m = /place_shop_order: (\w+)/.exec(message);
  return m ? m[1] : "failed";
}

Deno.serve(withMonitoring("studio-shop-checkout", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "bad_request" }, 400);
  }

  // Honeypot and time trap: pretend it worked, place nothing.
  if ((body.website ?? "").trim() !== "" || (body.elapsedMs !== undefined && body.elapsedMs < 1500)) {
    return jsonResponse({ ok: true, orderId: null });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const captchaOk = await leadCaptchaPasses({
    secret: Deno.env.get("TURNSTILE_SECRET_KEY"),
    token: body.captchaToken,
    verify: (secret, token) => verifyTurnstile(secret, token, ip === "unknown" ? null : ip),
  });
  if (!captchaOk) return jsonResponse({ error: "captcha_failed" }, 403);

  const service = createServiceClient();
  try {
    const { data: tenant } = await service
      .from("tenants")
      .select("id")
      .eq("subdomain", body.subdomain.trim().toLowerCase())
      .maybeSingle();
    if (!tenant?.id) return jsonResponse({ error: "not_found" }, 404);
    const tenantId = tenant.id as string;
    const email = normaliseContactPoint(body.email);

    // Only a working limit refuses; if the check itself fails, the order goes ahead.
    const limit = await checkAndIncrementAttempt(service, tenantId, `shop:${email}`, "email");
    if (!limit.allowed && limit.reason !== "check_failed") {
      return jsonResponse({ error: "too_many" }, 429);
    }

    const { data, error } = await service.rpc("place_guest_shop_order", {
      p_tenant_id: tenantId,
      p_name: body.name,
      p_email: email,
      p_phone: body.phone ?? null,
      p_lines: body.lines,
      p_pay_by_cash: body.payBy === "studio",
    });
    if (error) {
      const code = orderErrorCode(error.message);
      if (code === "failed") console.error("[studio-shop-checkout] order failed", error.message);
      return jsonResponse({ error: code }, code === "failed" ? 500 : 409);
    }
    const result = data as { order_id: string; pay_token: string | null; total_minor: number };

    // The coupon comes off the order's payment request before any email goes out.
    let coupon: ClassCouponResult | undefined;
    if (body.couponCode && result.pay_token) {
      try {
        coupon = await applyRequestCoupon(service, result.pay_token, body.couponCode);
      } catch (err) {
        console.error("[studio-shop-checkout] coupon:", err instanceof Error ? err.message : err);
        coupon = { ok: false, reason: "error" };
      }
    }
    let totalMinor = Number(result.total_minor) || 0;
    if (result.pay_token) {
      const { data: request } = await service
        .from("job_payment_requests")
        .select("amount_minor")
        .eq("public_token", result.pay_token)
        .maybeSingle();
      if (request) totalMinor = request.amount_minor as number;
    }

    // Never in the way of the order: a failure here only means no login or no email yet.
    try {
      await ensureClientLogin(service, { tenantId, email });
    } catch (err) {
      console.error("[studio-shop-checkout] client login:", err instanceof Error ? err.message : err);
    }
    await rememberClientLanguage(service, { tenantId, email, language: body.clientLanguage });
    await notifyBuyerShopOrderPlaced(service, result.order_id, result.pay_token).catch((err) =>
      console.error("[studio-shop-checkout] buyer email failed", err)
    );
    if (body.payBy === "studio") {
      await notifyStudioShopOrderSentIn(service, result.order_id).catch((err) =>
        console.error("[studio-shop-checkout] studio email failed", err)
      );
    }

    return jsonResponse({
      ok: true,
      orderId: result.order_id,
      payToken: body.payBy === "card" ? result.pay_token : null,
      totalMinor,
      coupon,
    });
  } catch (err) {
    console.error("[studio-shop-checkout]", err);
    return jsonResponse({ error: "failed" }, 500);
  }
}));
