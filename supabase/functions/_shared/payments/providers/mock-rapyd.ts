/**
 * mock-rapyd.ts — MockRapydAdapter
 *
 * Test double for RapydAdapter.
 * Activated by RAPYD_MOCK=true in env.
 * verifyWebhookSignature is also exposed as a static helper for tests.
 */

import type {
  IPaymentProvider,
  WebhookPayload,
  PaymentMeta,
  CheckoutResponse,
  PaymentResult,
  PlanParams,
  SubscriptionResponse,
  ChargeResponse,
  RefundResponse,
} from './types.ts';
import { PaymentProviderError, WebhookError } from './types.ts';
import { RapydAdapter } from './rapyd.ts';

export class MockRapydAdapter implements IPaymentProvider {
  // Injectable overrides
  public simulateCheckoutFailure   = false;
  public simulatePaymentFailed     = false;
  public simulateWebhookTampering  = false;
  public simulateReplayAttack      = false;
  public simulateCrossTenant       = false;
  public checkoutIdToReturn        = 'CHECKOUT-MOCK-001';
  public customerIdToReturn        = 'CUST-MOCK-001';

  async createCheckout(_amount: number, meta: PaymentMeta): Promise<CheckoutResponse> {
    if (this.simulateCheckoutFailure) {
      throw new PaymentProviderError('Checkout creation failed', 'RAPYD_CHECKOUT_FAILED', 400);
    }

    return {
      checkoutId:  this.checkoutIdToReturn,
      redirectUrl: `https://sandboxapi.rapyd.net/pay/${this.checkoutIdToReturn}`,
      status:      'active',
      expiresAt:   new Date(Date.now() + 3600 * 1000).toISOString(),
    };
  }

  async handleWebhook(payload: WebhookPayload): Promise<PaymentResult> {
    if (this.simulatePaymentFailed) {
      return {
        paymentId:   'PAY-MOCK-FAILED',
        status:      'failed',
        amount:      '100.00',
        currency:    'ILS',
        tenantId:    String(payload.metadata['tenant_id'] ?? ''),
        metadata:    payload.metadata,
        processedAt: new Date().toISOString(),
      };
    }

    return {
      paymentId:   `PAY-${payload.eventId}`,
      status:      'completed',
      amount:      '500.00',
      currency:    'ILS',
      tenantId:    String(payload.metadata['tenant_id'] ?? ''),
      metadata:    payload.metadata,
      processedAt: new Date().toISOString(),
    };
  }

  async createSubscription(plan: PlanParams): Promise<SubscriptionResponse> {
    const now = Date.now();
    return {
      subscriptionId:     `SUB-${plan.planId}-MOCK`,
      status:             'active',
      currentPeriodStart: new Date(now).toISOString(),
      currentPeriodEnd:   new Date(now + 30 * 24 * 3600 * 1000).toISOString(),
      nextBillingDate:    new Date(now + 30 * 24 * 3600 * 1000).toISOString(),
    };
  }

  async chargeToken(customerId: string, amount: number): Promise<ChargeResponse> {
    return {
      transactionId: `TXN-${customerId}-MOCK`,
      status:        'success',
      amount:        amount.toFixed(2),
      currency:      'ILS',
      processedAt:   new Date().toISOString(),
    };
  }

  async issueRefund(paymentId: string, amount?: number): Promise<RefundResponse> {
    return {
      refundId:          `REF-${paymentId}-MOCK`,
      status:            'completed',
      amount:            (amount ?? 500).toFixed(2),
      currency:          'ILS',
      processedAt:       new Date().toISOString(),
      originalPaymentId: paymentId,
    };
  }

  /** Exposes verifyWebhookSignature for tests that need it. */
  async verifyWebhookSignature(
    urlPath: string, salt: string, timestamp: string,
    bodyString: string, providedSig: string
  ): Promise<boolean> {
    return !this.simulateWebhookTampering;
  }

  /** Maps a raw Rapyd payload to the opaque WebhookPayload (delegates to real adapter). */
  static toOpaquePayload = RapydAdapter.toOpaquePayload;
}
