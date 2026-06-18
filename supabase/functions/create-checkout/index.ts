import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { resolveCheckoutSession } from "../_shared/checkout-session.ts";
import { getPaymentProviderForTenant } from "../_shared/payments/index.ts";

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

    const service = createServiceClient();
    const { data: earlyEngagement } = await service
      .from("engagements")
      .select("status, tenant_id, offering_id")
      .eq("id", body.engagement_id)
      .maybeSingle();

    if (
      earlyEngagement &&
      earlyEngagement.status !== "pending_payment" &&
      (earlyEngagement.status === "active" || earlyEngagement.status === "pending_waiver")
    ) {
      const { data: tenantRow } = await service
        .from("tenants")
        .select("payment_provider, payment_provider_public_key, currency")
        .eq("id", earlyEngagement.tenant_id)
        .single();

      return jsonResponse({
        clientSecret: null,
        paymentIntentId: null,
        publishableKey: tenantRow?.payment_provider_public_key ?? null,
        amountMinor: null,
        currency: (tenantRow?.currency ?? "ILS").toUpperCase(),
        paymentProvider: tenantRow?.payment_provider ?? "mock",
        mockCompleted: true,
        mockPending: false,
        alreadyPaid: true,
      });
    }

    const resolved = await resolveCheckoutSession(req, body);

    if (!resolved.ok) {
      return jsonResponse({ error: resolved.error }, resolved.status);
    }

    const { session } = resolved;
    const { service, tenant } = session;

    const provider = await getPaymentProviderForTenant(service, session.tenantId);
    const result = await provider.createCharge({
      amountMinor: session.totalMinor,
      currency: session.currency,
      idempotencyKey: session.idempotencyKey,
      metadata: session.metadata,
    });

    const isMock = tenant.payment_provider === "mock";

    return jsonResponse({
      clientSecret: result.clientSecret,
      paymentIntentId: result.providerPaymentRef,
      publishableKey: tenant.payment_provider_public_key,
      amountMinor: session.totalMinor,
      currency: session.currency,
      paymentProvider: tenant.payment_provider,
      mockCompleted: false,
      mockPending: isMock,
    });
  } catch (error) {
    console.error("[create-checkout]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});
