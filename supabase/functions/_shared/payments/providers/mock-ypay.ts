import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { insertPendingYpayPayment } from "../ypay/pending-charge.ts";
import { parseYpayCallback, peekYpayChargeIdentifier } from "../ypay/callback.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";

/**
 * Mock YPay adapter — CI/dev stand-in for the live API.
 *
 * Hosted charges INSERT a pending payment (D5) then return a mock.ypay.local pageUrl.
 * The mock trusts the callback (no live getTransactionsInfo verify) but still parses
 * the same shape, so the fulfilment path matches the live adapter.
 */
export class MockYpayPaymentProvider implements PaymentProvider {
  readonly slug = "ypay";

  constructor(private readonly service: SupabaseClient) {}

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    if (params.savedToken) {
      throw new Error("Mock YPay: saved-token charges are unsupported (no tokenization)");
    }

    const chargeIdentifier = crypto.randomUUID();
    await insertPendingYpayPayment(this.service, {
      chargeIdentifier,
      amountMinor: params.amountMinor,
      currency: params.currency,
      metadata: params.metadata,
    });

    return {
      providerPaymentRef: chargeIdentifier,
      pageUrl: `https://mock.ypay.local/pay/${chargeIdentifier}`,
      pendingWebhook: true,
    };
  }

  async constructEvent(rawBody: string, headers: Headers, _tenantId: string): Promise<PaymentEvent> {
    const sig = headers.get("x-mock-signature");
    if (sig !== "mock-valid") {
      throw new Error("Invalid mock YPay signature");
    }

    // Allow a raw JSON PaymentEvent for unit tests.
    if (rawBody.trim().startsWith("{") && !rawBody.includes("chargeIdentifier")) {
      return JSON.parse(rawBody) as PaymentEvent;
    }

    const chargeIdentifier = peekYpayChargeIdentifier(rawBody) ?? crypto.randomUUID();
    const placeholderMeta = {
      tenant_id: "00000000-0000-0000-0000-000000000001",
      engagement_id: "00000000-0000-0000-0000-000000000001",
      billing_account_id: "00000000-0000-0000-0000-000000000001",
      charge_type: "initial" as const,
    };
    return parseYpayCallback(rawBody, chargeIdentifier, placeholderMeta).event;
  }

  async chargeWithToken(_params: ChargeParams): Promise<ChargeResult> {
    throw new Error("Mock YPay: chargeWithToken unsupported (no tokenization)");
  }

  async refundCharge(params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }> {
    return { providerRefundRef: `mockypay_ref_${params.providerPaymentRef}_${params.amountMinor}` };
  }

  async verifyCredentials(_tenantId: string): Promise<{ valid: boolean; message: string }> {
    return { valid: true, message: "Mock YPay credentials accepted (YPAY_MOCK)." };
  }
}
