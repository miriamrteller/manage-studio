import { buildMockPaymentEvent } from "../mock-payment-event.ts";
import { ChargeMetadataSchema } from "../types.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";

/**
 * Mock Invoice4U payment adapter — CI/dev stand-in for the live API.
 *
 * Returned only when `payment_provider='invoice4u'` and `INVOICE4U_MOCK=true`.
 *
 * Hosted enrolment charges return a `pageUrl` and `pendingWebhook` — the parent
 * confirms via the mock card UI (`confirm-mock-payment`), matching Grow/iCount UX.
 *
 * Server-side token charges (renewals) return `emitSyncEvent` so cron/tests can
 * finalise without a hosted page.
 */
export class MockInvoice4uPaymentProvider implements PaymentProvider {
  readonly slug = "invoice4u";

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    const providerPaymentRef = `mockinvoice4u_${crypto.randomUUID()}`;

    if (params.savedToken) {
      const event = buildMockPaymentEvent({
        providerPaymentRef,
        amountMinor: params.amountMinor,
        currency: params.currency,
        metadata: params.metadata,
      });
      return { providerPaymentRef, emitSyncEvent: event };
    }

    return {
      providerPaymentRef,
      pageUrl: `https://mock.invoice4u.local/pay/${providerPaymentRef}`,
      pendingWebhook: true,
    };
  }

  async chargeWithToken(params: ChargeParams): Promise<ChargeResult> {
    if (!params.savedToken) {
      throw new Error("Mock Invoice4U ChargeWithToken requires savedToken");
    }
    const providerPaymentRef = `mockinvoice4u_${crypto.randomUUID()}`;
    const event = buildMockPaymentEvent({
      providerPaymentRef,
      amountMinor: params.amountMinor,
      currency: params.currency,
      metadata: params.metadata,
    });
    return { providerPaymentRef, emitSyncEvent: event };
  }

  async constructEvent(rawBody: string, headers: Headers, _tenantId: string): Promise<PaymentEvent> {
    const sig = headers.get("x-mock-signature");
    if (sig !== "mock-valid") {
      throw new Error("Invalid mock Invoice4U signature");
    }
    const parsed = JSON.parse(rawBody) as PaymentEvent;
    ChargeMetadataSchema.parse(parsed.metadata);
    return parsed;
  }

  async refundCharge(params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }> {
    return {
      providerRefundRef: `mockinvoice4u_ref_${params.providerPaymentRef}_${params.amountMinor}`,
    };
  }

  async verifyCredentials(_tenantId: string): Promise<{ valid: boolean; message: string }> {
    return { valid: true, message: "Mock Invoice4U credentials accepted (INVOICE4U_MOCK)." };
  }
}
