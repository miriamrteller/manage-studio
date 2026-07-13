/**
 * mock-tranzila.ts — MockTranzilaPaymentAdapter
 * Test double for TranzilaPaymentAdapter.
 * Activated by TRANZILA_MOCK=true env var in the providerForPayment() factory.
 * Returns predictable values for all IPaymentProvider methods.
 */

import type {
  IPaymentProvider,
  PaymentMeta,
  CheckoutResponse,
  WebhookPayload,
  PaymentResult,
  PlanParams,
  SubscriptionResponse,
  ChargeResponse,
  RefundResponse,
} from "./types.ts";

export class MockTranzilaPaymentAdapter implements IPaymentProvider {
  async createCheckout(_amount: number, _meta: PaymentMeta): Promise<CheckoutResponse> {
    const id = `mock-pr-${Date.now()}`;
    return {
      checkoutId:  id,
      redirectUrl: `https://pay.tranzila.com/pr/${id}`,
      status:      "active",
      expiresAt:   new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    };
  }

  async handleWebhook(_payload: WebhookPayload): Promise<PaymentResult> {
    return {
      paymentId:   "mock-pr-id",
      status:      "completed",
      amount:      "100.00",
      currency:    "ILS",
      tenantId:    "mock-tenant-id",
      metadata:    { auth_number: "012345", transaction_id: "mock-txn-id" },
      processedAt: new Date().toISOString(),
    };
  }

  async createSubscription(plan: PlanParams): Promise<SubscriptionResponse> {
    const now = new Date().toISOString();
    return {
      subscriptionId:     `mock-sto-${Date.now()}`,
      status:             "active",
      currentPeriodStart: now,
      currentPeriodEnd:   now,
      nextBillingDate:    (plan as any).firstChargeDate ?? now,
    };
  }

  async chargeToken(_customerId: string, amount: number): Promise<ChargeResponse> {
    return {
      transactionId: `mock-charge-${Date.now()}`,
      status:        "success",
      amount:        String(amount),
      currency:      "ILS",
      processedAt:   new Date().toISOString(),
    };
  }

  async issueRefund(paymentId: string, amount?: number): Promise<RefundResponse> {
    return {
      refundId:          `mock-refund-${Date.now()}`,
      status:            "completed",
      amount:            String(amount ?? 0),
      currency:          "ILS",
      processedAt:       new Date().toISOString(),
      originalPaymentId: paymentId,
    };
  }
}
