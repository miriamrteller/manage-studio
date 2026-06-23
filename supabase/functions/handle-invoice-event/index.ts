import { jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseGrowInvoiceNotify } from "../_shared/payments/providers/grow.ts";
import { applyGrowInvoiceNotify } from "../_shared/payments/grow/invoice.ts";

/**
 * Grow document webhook.
 *
 * Grow issues the tax document bundled with the charge and delivers it on a separate notify.
 * This handler upserts the document fields onto the matching payment row and reconciles the
 * `document_queue` so the generic invoicing worker never tries to re-issue it. It is idempotent:
 * if the payment already carries an `external_document_id`, the event is acknowledged as a
 * duplicate without a second write.
 */
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = await req.text();

  try {
    const parsed = parseGrowInvoiceNotify(JSON.parse(rawBody) as Record<string, unknown>);
    const service = createServiceClient();
    const result = await applyGrowInvoiceNotify(service, parsed);

    if (result.status === "payment_not_found") {
      // The payment notify may not have landed yet; ask Grow to retry.
      return jsonResponse({ error: "Payment not found for document" }, 409);
    }

    return jsonResponse({
      received: true,
      paymentId: result.paymentId,
      duplicate: result.status === "duplicate",
    });
  } catch (error) {
    console.error("[handle-invoice-event]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Webhook error" },
      400,
    );
  }
});
