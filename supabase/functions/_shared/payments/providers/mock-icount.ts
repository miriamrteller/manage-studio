import { buildMockPaymentEvent } from "../handle-payment-event.ts";
import { ChargeMetadataSchema } from "../types.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";

/**
 * Mock iCount payment adapter — CI/dev stand-in for the real CC page redirect flow.
 *
 * Returned only when `payment_provider='icount'` and `ICOUNT_MOCK=true`.
 */
export class MockIcountPaymentProvider implements PaymentProvider {
  readonly slug = "icount";

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    const providerPaymentRef = `mockicount_${crypto.randomUUID()}`;
    const amount = (params.amountMinor / 100).toFixed(2);

    if (params.savedToken) {
      const event = buildMockPaymentEvent({
        providerPaymentRef,
        amountMinor: params.amountMinor,
        currency: params.currency,
        metadata: params.metadata,
      });
      return { providerPaymentRef, emitSyncEvent: event };
    }

    const query = new URLSearchParams({
      cs: amount,
      cd: "OpalSwift enrolment",
      m__tenant_id: params.metadata.tenant_id,
      m__engagement_id: params.metadata.engagement_id,
    });

    return {
      providerPaymentRef,
      pageUrl: `https://mock.icount.local/pay/${providerPaymentRef}?${query.toString()}`,
      pendingWebhook: true,
    };
  }

  async constructEvent(rawBody: string, headers: Headers, _tenantId: string): Promise<PaymentEvent> {
    const sig = headers.get("x-mock-signature");
    if (sig !== "mock-valid") {
      throw new Error("Invalid mock iCount signature");
    }
    const parsed = JSON.parse(rawBody) as PaymentEvent;
    ChargeMetadataSchema.parse(parsed.metadata);
    return parsed;
  }

  async refundCharge(params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }> {
    return { providerRefundRef: `mockicount_ref_${params.providerPaymentRef}_${params.amountMinor}` };
  }

  async verifyCredentials(_tenantId: string): Promise<{ valid: boolean; message: string }> {
    return { valid: true, message: "Mock iCount credentials accepted (ICOUNT_MOCK)." };
  }
}
