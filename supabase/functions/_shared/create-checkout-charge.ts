import { createServiceClient } from "./edge-runtime/supabase.ts";
import { resolveCheckoutSession } from "./checkout-session.ts";
import { getPaymentProviderForTenant, isOfflinePaymentProvider } from "./payments/index.ts";
import { isProviderNotConfiguredError } from "./payments/not-configured.ts";
import type { CheckoutChargePayload } from "./checkout-bootstrap-types.ts";

export type CreateCheckoutChargeResult =
  | { ok: true; charge: CheckoutChargePayload }
  | { ok: false; error: string; status: number };

export async function createCheckoutCharge(
  req: Request,
  body: { offering_id: string; engagement_id: string; enrolment_token?: string },
): Promise<CreateCheckoutChargeResult> {
  const earlyService = createServiceClient();
  const { data: earlyEngagement } = await earlyService
    .from("engagements")
    .select("status, tenant_id, offering_id")
    .eq("id", body.engagement_id)
    .maybeSingle();

  if (
    earlyEngagement &&
    earlyEngagement.status !== "pending_payment" &&
    (earlyEngagement.status === "active" || earlyEngagement.status === "pending_waiver")
  ) {
    const { data: tenantRow } = await earlyService
      .from("tenants")
      .select("payment_provider, payment_provider_public_key, currency")
      .eq("id", earlyEngagement.tenant_id)
      .single();

    return {
      ok: true,
      charge: {
        clientSecret: null,
        paymentIntentId: null,
        publishableKey: tenantRow?.payment_provider_public_key ?? null,
        amountMinor: null,
        currency: (tenantRow?.currency ?? "ILS").toUpperCase(),
        paymentProvider: tenantRow?.payment_provider ?? "mock",
        mockCompleted: true,
        mockPending: false,
        alreadyPaid: true,
        pageUrl: null,
        pendingWebhook: false,
        billingMode: null,
        billingInterval: null,
      },
    };
  }

  const resolved = await resolveCheckoutSession(req, body);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, status: resolved.status };
  }

  const { session } = resolved;
  const { service, tenant } = session;

  // Pay at the studio: nothing to charge online. The place stays reserved
  // (pending_payment) until an admin records the payment.
  const payAtTheStudio = (onlinePaymentNotSetUp: boolean): CreateCheckoutChargeResult => ({
    ok: true,
    charge: {
      clientSecret: null,
      paymentIntentId: null,
      publishableKey: null,
      amountMinor: session.totalMinor,
      currency: session.currency,
      paymentProvider: "offline",
      mockCompleted: false,
      mockPending: false,
      pageUrl: null,
      pendingWebhook: false,
      alreadyPaid: false,
      billingMode: session.offering.billing_mode,
      billingInterval: session.offering.billing_interval,
      offlineInstructions: tenant.offline_payment_instructions,
      onlinePaymentNotSetUp,
    },
  });

  if (isOfflinePaymentProvider(tenant.payment_provider)) return payAtTheStudio(false);

  const provider = await getPaymentProviderForTenant(service, session.tenantId);
  let result: Awaited<ReturnType<typeof provider.createCharge>>;
  try {
    result = await provider.createCharge({
      amountMinor: session.totalMinor,
      currency: session.currency,
      idempotencyKey: session.idempotencyKey,
      metadata: session.metadata,
    });
  } catch (error) {
    // The studio picked online payment but has not connected it yet (no keys). The place stays
    // reserved as pending payment, exactly like pay-at-the-studio, and parents see a clear note
    // instead of an error. Any other failure is still an error.
    if (isProviderNotConfiguredError(error)) return payAtTheStudio(true);
    throw error;
  }

  if (result.emitSyncEvent) {
    const { applyMockSyncEvent } = await import("./payments/providers/mock.ts");
    await applyMockSyncEvent(service, result.emitSyncEvent, tenant.payment_provider);
  }

  const isMock = tenant.payment_provider === "mock";

  return {
    ok: true,
    charge: {
      clientSecret: result.clientSecret ?? null,
      paymentIntentId: result.providerPaymentRef,
      publishableKey: tenant.payment_provider_public_key,
      amountMinor: session.totalMinor,
      currency: session.currency,
      paymentProvider: tenant.payment_provider,
      mockCompleted: false,
      mockPending: isMock,
      pageUrl: result.pageUrl ?? null,
      pendingWebhook: result.pendingWebhook ?? false,
      alreadyPaid: false,
      billingMode: session.offering.billing_mode,
      billingInterval: session.offering.billing_interval,
    },
  };
}
