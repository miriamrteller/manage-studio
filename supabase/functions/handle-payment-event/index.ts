import { jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { handlePaymentEventInternal } from "../_shared/payments/handle-payment-event.ts";
import { getPaymentProviderForTenant } from "../_shared/payments/index.ts";
import { peekGrowTenantId } from "../_shared/payments/grow/metadata.ts";

/**
 * Resolve the tenant before provider dispatch. Stripe nests metadata under
 * `data.object.metadata`; Grow routes per-tenant via the `cField1` custom field. We support
 * both shapes so the handler is not hard-coded to a single provider's body.
 */
function peekTenantId(rawBody: string): string | undefined {
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
    const tenantId = peekTenantId(rawBody);

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
