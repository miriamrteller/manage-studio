import { buildMockPaymentEvent } from "../mock-payment-event.ts";
import { ChargeMetadataSchema } from "../types.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";

/**
 * Mock Grow payment adapter — CI/dev stand-in for the real Grow API.
 *
 * Returned only when `payment_provider='grow'` and `GROW_MOCK=true`, so CI never hits the
 * live Meshulam API.
 *
 * Hosted-page enrolment charges return a `pageUrl` and `pendingWebhook` only — the parent
 * confirms via the mock card UI (`confirm-mock-payment`), matching real Grow UX.
 *
 * Server-side token charges (renewals) still return `emitSyncEvent` so cron/tests can
 * finalise without a hosted page.
 */
export class MockGrowPaymentProvider implements PaymentProvider {
  readonly slug = "grow";

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    const providerPaymentRef = `mockgrow_${crypto.randomUUID()}`;

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
      pageUrl: `https://mock.grow.local/pay/${providerPaymentRef}`,
      pendingWebhook: true,
    };
  }

  async constructEvent(rawBody: string, headers: Headers, _tenantId: string): Promise<PaymentEvent> {
    const sig = headers.get("x-mock-signature");
    if (sig !== "mock-valid") {
      throw new Error("Invalid mock grow signature");
    }
    const parsed = JSON.parse(rawBody) as PaymentEvent;
    ChargeMetadataSchema.parse(parsed.metadata);
    return parsed;
  }

  async refundCharge(params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }> {
    return { providerRefundRef: `mockgrow_ref_${params.providerPaymentRef}_${params.amountMinor}` };
  }

  async verifyCredentials(_tenantId: string): Promise<{ valid: boolean; message: string }> {
    return { valid: true, message: "Mock Grow credentials accepted (GROW_MOCK)." };
  }
}
