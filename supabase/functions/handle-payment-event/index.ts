import { jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient } from "../../packages/edge-runtime/src/supabase.ts";
import { handlePaymentEventInternal } from "../_shared/payments/handle-payment-event.ts";
import { getPaymentProviderForTenant } from "../_shared/payments/index.ts";
import { peekGrowTenantId } from "../_shared/payments/grow/metadata.ts";
import { peekInvoice4uOrderId } from "../_shared/payments/invoice4u/callback.ts";
import { loadPaymentByProviderRef } from "../_shared/payments/invoice4u/pending-charge.ts";
import { processInvoice4uPaymentCallback } from "../_shared/payments/invoice4u/process-callback.ts";

/**
 * Resolve the tenant before provider dispatch.
 * Order: Invoice4U form Data= (pending row) → JSON/Stripe metadata → Grow cField peek.
 */
async function peekTenantId(
  service: ReturnType<typeof createServiceClient>,
  rawBody: string,
): Promise<string | undefined> {
  const orderId = peekInvoice4uOrderId(rawBody);
  if (orderId) {
    const pending = await loadPaymentByProviderRef(service, orderId);
    if (pending?.tenant_id) return pending.tenant_id;
  }

  try {
    const parsed = JSON.parse(rawBody) as {
      data?: { object?: { metadata?: { tenant_id?: string } } };
      metadata?: { tenant_id?: string };
    };
    const stripeShaped =
      parsed.data?.object?.metadata?.tenant_id ?? parsed.metadata?.tenant_id;
    if (stripeShaped) return stripeShaped;
    return peekGrowTenantId(parsed as Record<string, unknown>);
  } catch {
    return undefined;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = await req.text();

  try {
    const service = createServiceClient();

    // Invoice4U form callback — dedicated pending-row path (D5/D12)
    if (peekInvoice4uOrderId(rawBody)) {
      const result = await processInvoice4uPaymentCallback(service, rawBody);
      if (result.status === "amount_mismatch") {
        return jsonResponse(
          { error: "Amount mismatch", received: false, ...result },
          400,
        );
      }
      return jsonResponse({ received: true, ...result });
    }

    const tenantId = await peekTenantId(service, rawBody);

    if (!tenantId) {
      return jsonResponse({ error: "Missing tenant_id in metadata" }, 400);
    }

    const provider = await getPaymentProviderForTenant(service, tenantId);
    const event = await provider.constructEvent(rawBody, req.headers, tenantId);
    const result = await handlePaymentEventInternal(service, event, provider.slug);

    return jsonResponse({ received: true, ...result });
  } catch (error) {
    console.error("[handle-payment-event]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Webhook error" },
      400,
    );
  }
});
