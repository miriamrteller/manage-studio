/**
 * rapyd.ts — RapydAdapter
 *
 * Implements IPaymentProvider for Rapyd global payments.
 * ISA-licensed in Israel (2025). OpalSwift is never in the flow of funds.
 * PCI: Rapyd hosted checkout — OpalSwift never touches card data.
 *
 * PA-1: handleWebhook() maps RapydWebhookPayload → WebhookPayload internally.
 *       No caller outside this adapter ever sees RapydWebhookPayload.
 *
 * CRITICAL — Deno runtime: requires Web Crypto API (crypto.subtle).
 *            Never use require('crypto') — Node.js only.
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
  RapydConfig,
  RapydWebhookPayload,
  RapydCheckoutRequest,
  RapydCheckoutResponse,
} from './types.ts';
import { PaymentProviderError, WebhookError } from './types.ts';

/** Rapyd base URL — set once at instantiation from tenant config. */
type RapydEnv = 'sandbox' | 'production';

export class RapydAdapter implements IPaymentProvider {
  private readonly baseUrl: string;
  private readonly accessKey: string;
  private readonly secretKey: string;  // resolved from vault at instantiation; never stored after

  constructor(private readonly config: RapydConfig & { resolvedSecretKey: string }) {
    this.baseUrl   = config.sandbox
      ? 'https://sandboxapi.rapyd.net'
      : 'https://api.rapyd.net';
    this.accessKey = config.access_key;
    this.secretKey = config.resolvedSecretKey;
  }

  // ── HMAC Signing — Web Crypto API (Deno-compatible) ───────────────────────
  //
  // Formula (from Rapyd docs — https://docs.rapyd.net/en/signing-messages.html):
  //   method.toLowerCase() + urlPath + salt + timestamp + accessKey + secretKey + bodyString
  //
  // CRITICAL: concatenation order is exact — do NOT reorder.
  // CRITICAL: decimal amounts MUST be strings ("12.50" not 12.5) or signature will mismatch.

  private async sign(
    method: string,
    urlPath: string,
    salt: string,
    timestamp: string,
    bodyString: string
  ): Promise<string> {
    const toSign =
      method.toLowerCase() +
      urlPath +
      salt +
      timestamp +
      this.accessKey +
      this.secretKey +
      bodyString;

    const encoder   = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(toSign));
    const hexHash   = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return btoa(hexHash);
  }

  /** Generates required HMAC request headers for every Rapyd API call. */
  private async buildHeaders(
    method: string,
    urlPath: string,
    body: unknown
  ): Promise<Record<string, string>> {
    const salt       = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const timestamp  = String(Math.floor(Date.now() / 1000));
    const bodyString = body && Object.keys(body as object).length > 0
      ? JSON.stringify(body)
      : '';

    const sig = await this.sign(method, urlPath, salt, timestamp, bodyString);

    return {
      'Content-Type': 'application/json',
      'access_key':   this.accessKey,
      'salt':         salt,
      'timestamp':    timestamp,
      'signature':    sig,
      'idempotency':  crypto.randomUUID(),
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers  = await this.buildHeaders(method, path, body ?? {});
    const url      = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json() as { status?: { status?: string; message?: string } };

    if (!response.ok || data?.status?.status === 'ERROR') {
      throw new PaymentProviderError(
        data?.status?.message ?? 'Rapyd API error',
        'RAPYD_API_ERROR',
        response.status,
        data
      );
    }

    return data as T;
  }

  /**
   * Creates a Rapyd hosted checkout page.
   * PCI: Rapyd handles all card data — OpalSwift receives only checkout ID and redirect URL.
   */
  async createCheckout(amount: number, meta: PaymentMeta): Promise<CheckoutResponse> {
    const body: RapydCheckoutRequest = {
      amount:                  amount.toFixed(2),  // string, preserves decimal precision
      currency:                meta.currency,
      country:                 'IL',
      customer:                undefined,           // set after first charge (customer lifecycle)
      description:             meta.description,
      metadata:                { tenant_id: meta.tenantId, client_name: meta.clientName },
      complete_checkout_url:   meta.successUrl,
      error_payment_url:       meta.errorUrl,
      payment_expiration:      Math.floor(Date.now() / 1000) + 3600,  // 1 hour
    };

    const resp = await this.request<RapydCheckoutResponse>('POST', '/v1/checkout', body);

    if (!resp.data) {
      throw new PaymentProviderError(
        'Rapyd checkout returned no data',
        'RAPYD_CHECKOUT_FAILED',
        500,
        resp
      );
    }

    return {
      checkoutId:  resp.data.id,
      redirectUrl: resp.data.redirect_url,
      status:      'active',
      expiresAt:   new Date((resp.data.page_expiration ?? Date.now() / 1000 + 3600) * 1000).toISOString(),
    };
  }

  /**
   * PA-1: Maps RapydWebhookPayload → WebhookPayload (opaque) internally.
   * The opaque WebhookPayload is the ONLY shape that escapes this method.
   *
   * This method is called by the rapyd-webhook edge function AFTER signature
   * verification and replay/tenant checks. It extracts PaymentResult from the
   * already-verified payload.
   */
  async handleWebhook(payload: WebhookPayload): Promise<PaymentResult> {
    // At this point payload is the opaque interface — metadata holds the raw Rapyd data
    const raw = payload.metadata['raw'] as RapydWebhookPayload | undefined;
    if (!raw) {
      throw new WebhookError('Missing raw payload in webhook metadata', 'WEBHOOK_MISSING_RAW');
    }

    const data    = raw.data;
    const status  = this.mapRapydStatus(raw.type, data.status);
    const tenantId = String(data.metadata?.['tenant_id'] ?? '');

    return {
      paymentId:   data.id,
      status,
      amount:      data.amount.toFixed(2),
      currency:    data.currency,
      tenantId,
      metadata:    data.metadata,
      processedAt: new Date().toISOString(),
    };
  }

  /** Creates a Rapyd subscription for recurring billing (Roster tier). */
  async createSubscription(plan: PlanParams): Promise<SubscriptionResponse> {
    // Customer lifecycle: customerId must already be stored in tenant config.
    // See build-plan §3.2 customer lifecycle — never create a new customer per charge.
    const body = {
      customer:           plan.customerId,
      payment_method:     plan.customerId,   // will be replaced by actual PM ID
      subscription_items: [{ plan: plan.planId, quantity: 1 }],
      trial_period_days:  plan.trialDays,
      metadata:           { billing_cycle: plan.billingCycle },
    };

    const resp = await this.request<{
      status: { status: string };
      data?: {
        id: string;
        status: string;
        current_period_start: number;
        current_period_end: number;
        billing_cycle_anchor: number;
      };
    }>('POST', '/v1/subscriptions', body);

    if (!resp.data) {
      throw new PaymentProviderError('Rapyd subscription creation failed', 'RAPYD_SUBSCRIPTION_FAILED', 500, resp);
    }

    const d = resp.data;
    return {
      subscriptionId:     d.id,
      status:             'active',
      currentPeriodStart: new Date(d.current_period_start * 1000).toISOString(),
      currentPeriodEnd:   new Date(d.current_period_end   * 1000).toISOString(),
      nextBillingDate:    new Date(d.billing_cycle_anchor  * 1000).toISOString(),
    };
  }

  /**
   * Charges a stored Rapyd customer token.
   * customerId = Rapyd customer_id stored in tenant_configs.rapyd_config.customer_id.
   * NEVER re-creates the customer — a new customer per charge creates orphaned objects.
   */
  async chargeToken(customerId: string, amount: number): Promise<ChargeResponse> {
    const body = {
      amount:   amount.toFixed(2),
      currency: 'ILS',
      customer: customerId,
      capture:  true,
    };

    const resp = await this.request<{
      status: { status: string };
      data?: { id: string; amount: number; currency: string; status: string; created_at: number };
    }>('POST', '/v1/payments', body);

    if (!resp.data) {
      throw new PaymentProviderError('Rapyd charge failed', 'RAPYD_CHARGE_FAILED', 500, resp);
    }

    return {
      transactionId: resp.data.id,
      status:        resp.data.status === 'CLO' ? 'success' : 'pending',
      amount:        resp.data.amount.toFixed(2),
      currency:      'ILS',
      processedAt:   new Date(resp.data.created_at * 1000).toISOString(),
    };
  }

  /** Issues full or partial refund via Rapyd. */
  async issueRefund(paymentId: string, amount?: number): Promise<RefundResponse> {
    const body: { payment: string; amount?: string } = { payment: paymentId };
    if (amount !== undefined) {
      body.amount = amount.toFixed(2);  // MUST be string
    }

    const resp = await this.request<{
      status: { status: string };
      data?: {
        id: string;
        amount: number;
        currency: string;
        status: string;
        created_at: number;
        payment: string;
      };
    }>('POST', '/v1/refunds', body);

    if (!resp.data) {
      throw new PaymentProviderError('Rapyd refund failed', 'RAPYD_REFUND_FAILED', 500, resp);
    }

    return {
      refundId:          resp.data.id,
      status:            'completed',
      amount:            resp.data.amount.toFixed(2),
      currency:          resp.data.currency as 'ILS' | 'USD' | 'EUR',
      processedAt:       new Date(resp.data.created_at * 1000).toISOString(),
      originalPaymentId: paymentId,
    };
  }

  // ── Webhook Signature Verification (inbound Rapyd → OpalSwift) ──────────────
  // Webhook variant: excludes http_method from concatenation (differs from API requests).
  // Called by rapyd-webhook edge function BEFORE handleWebhook().

  async verifyWebhookSignature(
    urlPath:    string,
    salt:       string,
    timestamp:  string,
    bodyString: string,
    providedSig: string
  ): Promise<boolean> {
    // Webhook formula: urlPath + salt + timestamp + accessKey + secretKey + bodyString
    // Note: no method prefix (differs from regular API signing)
    const toSign =
      urlPath + salt + timestamp + this.accessKey + this.secretKey + bodyString;

    const encoder   = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBytes  = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(toSign));
    const hexHash   = Array.from(new Uint8Array(sigBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const computed  = btoa(hexHash);

    // Constant-time comparison to prevent timing attacks
    return this.constantTimeEqual(computed, providedSig);
  }

  private constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  /**
   * Converts inbound RapydWebhookPayload to the opaque WebhookPayload interface.
   * The raw Rapyd payload is stored in metadata['raw'] for handleWebhook() access.
   * No RapydWebhookPayload shape escapes outside the adapter.
   */
  static toOpaquePayload(raw: RapydWebhookPayload): WebhookPayload {
    return {
      eventId:   raw.id,
      eventType: raw.type,
      timestamp: new Date(raw.created_at * 1000).toISOString(),
      metadata:  { raw } as Record<string, unknown>,
    };
  }

  private mapRapydStatus(
    eventType: string,
    _paymentStatus: string
  ): 'completed' | 'failed' | 'pending' | 'cancelled' | 'refunded' | 'partially_refunded' {
    switch (eventType) {
      case 'PAYMENT.SUCCEEDED':
      case 'PAYMENT.SUBSCRIPTION.PAID':
        return 'completed';
      case 'PAYMENT.FAILED':
        return 'failed';
      case 'PAYMENT.CANCELLED':
        return 'cancelled';
      case 'PAYMENT.REFUND.COMPLETED':
        return 'refunded';
      default:
        return 'pending';
    }
  }
}
