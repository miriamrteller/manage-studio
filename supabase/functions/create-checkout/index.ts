import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createCheckoutCharge } from "../_shared/create-checkout-charge.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

interface CreateCheckoutBody {
  offering_id: string;
  engagement_id: string;
  enrolment_token?: string;
  pay_with?: "card" | "bit";
  is_mobile?: boolean;
}

serve(withMonitoring("create-checkout", async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as CreateCheckoutBody;
    if (!body.offering_id || !body.engagement_id) {
      return jsonResponse({ error: "offering_id and engagement_id are required" }, 400);
    }

    const result = await createCheckoutCharge(req, {
      offering_id: body.offering_id,
      engagement_id: body.engagement_id,
      enrolment_token: body.enrolment_token,
      pay_with: body.pay_with === "bit" ? "bit" : undefined,
      is_mobile: body.is_mobile === true,
    });
    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status);
    }

    const { charge } = result;
    return jsonResponse({
      clientSecret: charge.clientSecret,
      paymentIntentId: charge.paymentIntentId,
      publishableKey: charge.publishableKey,
      amountMinor: charge.amountMinor,
      currency: charge.currency,
      paymentProvider: charge.paymentProvider,
      mockCompleted: charge.mockCompleted,
      mockPending: charge.mockPending,
      pageUrl: charge.pageUrl,
      pendingWebhook: charge.pendingWebhook,
      alreadyPaid: charge.alreadyPaid,
      offlineInstructions: charge.offlineInstructions ?? null,
      onlinePaymentNotSetUp: charge.onlinePaymentNotSetUp ?? false,
    });
  } catch (error) {
    console.error("[create-checkout]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
}));
