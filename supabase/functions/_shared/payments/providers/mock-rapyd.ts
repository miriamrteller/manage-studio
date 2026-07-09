/**
 * MockRapydAdapter — test double for RapydAdapter.
 * Returns predictable success responses. Use RAPYD_MOCK=true env var.
 */

import type {
  ChargeResponse,
  CheckoutResponse,
  IPaymentProvider,
  PaymentMeta,
  PaymentResult,
  PlanParams,
  RefundResponse,
  SubscriptionResponse,
  WebhookPayload,
} from "./invoicing-types.ts";

export class MockRapydAdapter implements IPaymentProvider {
  async createCheckout(_amount: number, meta: PaymentMeta): Promise<CheckoutResponse> {
    return {
      checkoutId: `mock_checkout_${crypto.randomUUID()}`,
      redirectUrl: `https://mock.rapyd.test/checkout/${crypto.randomUUID()}`,
      status: "active",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  }

  async handleWebhook(payload: WebhookPayload): Promise<PaymentResult> {
    return {
      paymentId: payload.eventId,
      status: "completed",
      amount: "0",
      currency: "ILS",
      tenantId: String(payload.metadata["tenant_id"] ?? "mock"),
      metadata: payload.metadata,
      processedAt: payload.timestamp,
    };
  }

  async createSubscription(plan: PlanParams): Promise<SubscriptionResponse> {
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return {
      subscriptionId: `mock_sub_${crypto.randomUUID()}`,
      status: "active",
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: nextMonth.toISOString(),
      nextBillingDate: nextMonth.toISOString(),
    };
  }

  async chargeToken(customerId: string, amount: number): Promise<ChargeResponse> {
    return {
      transactionId: `mock_txn_${crypto.randomUUID()}`,
      status: "success",
      amount: amount.toFixed(2),
      currency: "ILS",
      processedAt: new Date().toISOString(),
    };
  }

  async issueRefund(paymentId: string, amount?: number): Promise<RefundResponse> {
    return {
      refundId: `mock_refund_${crypto.randomUUID()}`,
      status: "completed",
      amount: amount !== undefined ? amount.toFixed(2) : "0",
      currency: "ILS",
      processedAt: new Date().toISOString(),
      originalPaymentId: paymentId,
    };
  }
}
