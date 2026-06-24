import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createCheckoutCharge } from "../_shared/create-checkout-charge.ts";

interface CreateCheckoutBody {
  offering_id: string;
  engagement_id: string;
  enrolment_token?: string;
}

serve(async (req) => {
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

    const result = await createCheckoutCharge(req, body);
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
    });
  } catch (error) {
    console.error("[create-checkout]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});
