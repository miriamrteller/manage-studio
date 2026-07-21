import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  buildMockInvoice4uCallbackBody,
  parseInvoice4uCallback,
} from "../invoice4u/callback.ts";
import { insertPendingInvoice4uPayment } from "../invoice4u/pending-charge.ts";
import { buildMockPaymentEvent } from "../mock-payment-event.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";

/**
 * Mock Invoice4U payment adapter — CI/dev stand-in for the live API.
 *
 * Hosted charges INSERT a pending payment (D5) then return mock.invoice4u.local pageUrl.
 * Token renewals emit a sync event (no pending hosted row — D14).
 */
export class MockInvoice4uPaymentProvider implements PaymentProvider {
  readonly slug = "invoice4u";

  constructor(private readonly service: SupabaseClient) {}

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    if (params.savedToken) {
      const providerPaymentRef = crypto.randomUUID();
      const event = buildMockPaymentEvent({
        providerPaymentRef,
        amountMinor: params.amountMinor,
        currency: params.currency,
        metadata: params.metadata,
      });
      return { providerPaymentRef, emitSyncEvent: event };
    }

    const orderId = crypto.randomUUID();
    await insertPendingInvoice4uPayment(this.service, {
      orderId,
      amountMinor: params.amountMinor,
      currency: params.currency,
      metadata: params.metadata,
    });

    return {
      providerPaymentRef: orderId,
      pageUrl: `https://mock.invoice4u.local/pay/${orderId}`,
      pendingWebhook: true,
    };
  }

  async chargeWithToken(params: ChargeParams): Promise<ChargeResult> {
    if (!params.savedToken) {
      throw new Error("Mock Invoice4U ChargeWithToken requires savedToken");
    }
    const providerPaymentRef = crypto.randomUUID();
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

    // Form callback path — metadata filled by processInvoice4uPaymentCallback from pending row.
    // For constructEvent unit use, callers may pass JSON PaymentEvent instead.
    if (rawBody.trim().startsWith("{") && !rawBody.includes("OrderIdClientUsage")) {
      return JSON.parse(rawBody) as PaymentEvent;
    }

    // Minimal parse for signature tests — real fulfilment uses processInvoice4uPaymentCallback.
    const placeholderMeta = {
      tenant_id: "00000000-0000-0000-0000-000000000001",
      engagement_id: "00000000-0000-0000-0000-000000000001",
      billing_account_id: "00000000-0000-0000-0000-000000000001",
      charge_type: "initial" as const,
    };
    return parseInvoice4uCallback(rawBody, placeholderMeta).event;
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

export { buildMockInvoice4uCallbackBody };
