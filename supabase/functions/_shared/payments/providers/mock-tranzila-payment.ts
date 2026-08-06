import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { buildMockPaymentEvent } from "../mock-payment-event.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";

/**
 * Mock Tranzila adapter — CI/dev stand-in, selected by TRANZILA_MOCK=true.
 * Hosted redirect to mock.tranzila.local; no live terminal required.
 */
export class MockTranzilaPaymentProvider implements PaymentProvider {
  readonly slug = "tranzila";

  constructor(private readonly service: SupabaseClient) {
    void this.service;
  }

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    const ref = crypto.randomUUID();
    return {
      providerPaymentRef: ref,
      pageUrl: `https://mock.tranzila.local/pay/${ref}`,
      pendingWebhook: true,
    };
  }

  async constructEvent(rawBody: string, headers: Headers, _tenantId: string): Promise<PaymentEvent> {
    if (headers.get("x-mock-signature") !== "mock-valid") {
      throw new Error("Invalid mock Tranzila signature");
    }
    return JSON.parse(rawBody) as PaymentEvent;
  }

  async chargeWithToken(params: ChargeParams): Promise<ChargeResult> {
    const ref = crypto.randomUUID();
    return {
      providerPaymentRef: ref,
      emitSyncEvent: buildMockPaymentEvent({
        providerPaymentRef: ref,
        amountMinor: params.amountMinor,
        currency: params.currency,
        metadata: params.metadata,
      }),
    };
  }

  async refundCharge(params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }> {
    return { providerRefundRef: `mocktranzila_ref_${params.providerPaymentRef}_${params.amountMinor}` };
  }

  async verifyCredentials(_tenantId: string): Promise<{ valid: boolean; message: string }> {
    return { valid: true, message: "Mock Tranzila credentials accepted (TRANZILA_MOCK)." };
  }
}
