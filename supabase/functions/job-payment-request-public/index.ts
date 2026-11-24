import { z } from "npm:zod@4.6.7";
import { handleOptions, jsonResponse, internalError } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { createJobPaymentRequestCharge } from "../_shared/jobs/create-request-charge.ts";
import { jobOnlinePaymentSupported } from "../_shared/provider-pairing.ts";
import { loadJobPaymentRequestByToken } from "../_shared/jobs/load-request.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { parseDiscountLines } from "../_shared/payments/class-discount.ts";
import { applyRequestCoupon, studioHasClassCoupons } from "../_shared/payments/class-coupon.ts";
import { isCollectable } from "../_shared/jobs/payment-request-state.ts";

/**
 * Public pay page backend for /pay/:token (no session — the token IS the capability).
 *
 *   get           → what the client sees: studio, label, amount, due date, status.
 *   create_charge → hosted YPay page URL for this request (refused unless collectable).
 *   status        → poll after returning from the hosted page.
 *   apply_coupon  → a coupon code the client typed; a bad code is reported, never an error.
 *
 * Deliberately narrow: no person/finance rows leave this function, only the
 * request's own public facts. Tokens are 48 hex chars and unguessable.
 */
const BodySchema = z.object({
  token: z.string().min(16).max(128),
  action: z.enum(["get", "create_charge", "status", "apply_coupon"]).default("get"),
  /** apply_coupon: the code the client typed. */
  code: z.string().max(80).optional(),
  /** Takbull: pay with Bit; on a phone the answer opens the Bit app. */
  pay_with: z.enum(["card", "bit"]).optional(),
  is_mobile: z.boolean().optional(),
});

Deno.serve(withMonitoring("job-payment-request-public", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  try {
    const service = createServiceClient();
    let request = await loadJobPaymentRequestByToken(service, body.token);
    if (!request) return jsonResponse({ error: "Payment request not found" }, 404);

    let coupon = null;
    if (body.action === "apply_coupon") {
      coupon = await applyRequestCoupon(service, body.token, body.code ?? "");
      if (coupon.ok) request = (await loadJobPaymentRequestByToken(service, body.token)) ?? request;
    }

    const { data: tenant } = await service
      .from("tenants")
      .select("id, name, language_default, primary_color, accent_color, logo_url, payment_provider")
      .eq("id", request.tenant_id)
      .single();
    if (!tenant) return jsonResponse({ error: "Studio not found" }, 404);

    const { data: engagement } = await service
      .from("engagements")
      .select("booked_starts_at, status")
      .eq("id", request.engagement_id)
      .maybeSingle();

    const publicView = {
      id: request.id,
      label: request.label,
      amountMinor: request.amount_minor,
      /** Before discounts, with each discount as its own line; only when there is a discount. */
      listAmountMinor: request.list_amount_minor ?? null,
      discounts: request.list_amount_minor != null ? parseDiscountLines(request.discount_lines) : [],
      /** The studio has coupon codes: the page offers a box to type one. */
      couponsOffered: isCollectable(request.status) && (await studioHasClassCoupons(service, request.tenant_id)),
      currency: request.currency,
      dueDate: request.due_date,
      status: request.status,
      paidAt: request.paid_at,
      maxInstallments: request.max_installments,
      jobDate: engagement?.booked_starts_at ?? null,
      jobCancelled: engagement?.status === "cancelled" || engagement?.status === "withdrawn",
      studio: {
        name: tenant.name,
        language: tenant.language_default === "he" ? "he" : "en",
        primaryColor: tenant.primary_color,
        accentColor: tenant.accent_color,
        logoUrl: tenant.logo_url ?? null,
      },
      paymentProvider: tenant.payment_provider,
      /** False when the studio's provider cannot settle this request online: pay the studio directly. */
      onlinePaymentAvailable: jobOnlinePaymentSupported(tenant.payment_provider as string | null),
    };

    if (body.action === "get" || body.action === "status") {
      return jsonResponse({ request: publicView });
    }
    if (body.action === "apply_coupon") {
      return jsonResponse({ request: publicView, coupon });
    }

    const charge = await createJobPaymentRequestCharge(service, request, {
      tenantLabel: tenant.name as string,
      ...(body.pay_with === "bit" ? { payWith: "bit" as const, isMobile: body.is_mobile === true } : {}),
    });
    if (!charge.ok) return jsonResponse({ error: charge.error, request: publicView }, charge.status);

    return jsonResponse({ request: publicView, pageUrl: charge.pageUrl });
  } catch (error) {
    console.error("[job-payment-request-public]", error);
    return internalError("job-payment-request-public", error);
  }
}));
