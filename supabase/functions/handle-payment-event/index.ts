import { jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { handlePaymentEventInternal } from "../_shared/payments/handle-payment-event.ts";
import { getPaymentProviderForTenant } from "../_shared/payments/index.ts";

function peekTenantId(rawBody: string): string | undefined {
  try {
    const parsed = JSON.parse(rawBody) as {
      data?: { object?: { metadata?: { tenant_id?: string } } };
      metadata?: { tenant_id?: string };
    };
    return parsed.data?.object?.metadata?.tenant_id ?? parsed.metadata?.tenant_id;
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
