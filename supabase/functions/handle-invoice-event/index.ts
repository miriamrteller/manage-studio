import { jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { handleInvoiceEventInternal } from "../_shared/payments/handle-invoice-event.ts";

/**
 * Bundled document webhook (Grow + iCount).
 *
 * Dispatches by tenant `invoicing_provider` slug — never by country or body shape alone.
 * Upserts document fields onto the matching payment row and reconciles `document_queue`.
 */
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = await req.text();

  try {
    const service = createServiceClient();
    const result = await handleInvoiceEventInternal(service, rawBody);

    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status);
    }

    return jsonResponse({
      received: true,
      paymentId: result.paymentId,
      duplicate: result.duplicate,
    });
  } catch (error) {
    console.error("[handle-invoice-event]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Webhook error" },
      500,
    );
  }
});
