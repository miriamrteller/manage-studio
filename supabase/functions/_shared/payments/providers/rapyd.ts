/**
 * RapydAdapter — IPaymentProvider implementation for Rapyd global payments.
 *
 * be-adapter-spec.md v1.4.0 §3, §4, §5.2 (HMAC signing)
 *
 * Key implementation rules:
 * - HMAC-SHA256 signing using Web Crypto API (Deno-compatible — no require('crypto'))
 * - Sandbox/production switching from tenant.payment_provider_sandbox — NEVER per-request
 * - All decimal amounts sent as strings ("12.50" not 12.5) — critical for signature match
 * - Opaque WebhookPayload boundary: RapydWebhookPayload → WebhookPayload mapping is internal
 * - No escrow: escrow field is excluded by design throughout
 * - Customer lifecycle: customer_id created once on first checkout, stored in tenant config
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
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
import {
  PaymentProviderError,
  WebhookError,
} from "./invoicing-types.ts";

// ---------------------------------------------------------------------------
// Internal Rapyd shapes (not exported — adapter boundary)
// ---------------------------------------------------------------------------

interface RapydStatus {
  error_code: string;
  status: string; // "SUCCESS" | "ERROR"
  message: string;
  response_code: string;
  operation_id: string;
}

interface RapydWebhookPayload {
  id: string;
  type: string;
  data: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    payment_method_type: string;
    created_at: number;
    metadata: Record<string, unknown>;
  };
  trigger_operation_id: string;
  status: string;
  created_at: number;
}

interface RapydCredentials {
  accessKey: string;
  secretKey: string;
  webhookSecret: string;
  sandbox: boolean;
  customerId?: string;
}

// ---------------------------------------------------------------------------
// HMAC signing (Web Crypto API — Deno / Supabase Edge Functions)
// spec §5.2: method + urlPath + salt + timestamp + accessKey + secretKey + bodyString
// ---------------------------------------------------------------------------

function generateSalt(length = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function sign(
  method: string,
  urlPath: string,
  salt: string,
  timestamp: string,
  body: string,
  accessKey: string,
  secretKey: string,
): Promise<string> {
  // ⚠️ Critical: decimal amounts in body MUST be strings ("12.50") to match signature
  const bodyString = body && body !== "{}" ? body : "";
  // ⚠️ Critical: concatenation order is EXACT — do not reorder
  const toSign = method.toLowerCase() + urlPath + salt + timestamp + accessKey + secretKey + bodyString;

  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(toSign));
  const hexHash = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return btoa(hexHash);
}

async function buildRapydHeaders(
  method: string,
  urlPath: string,
  body: string,
  accessKey: string,
  secretKey: string,
): Promise<Record<string, string>> {
  const salt = generateSalt();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await sign(method, urlPath, salt, timestamp, body, accessKey, secretKey);

  return {
    "Content-Type": "application/json",
    "access_key": accessKey,
    "salt": salt,
    "timestamp": timestamp,
    "signature": signature,
    "idempotency": crypto.randomUUID(), // strongly recommended per Rapyd docs
  };
}

// ---------------------------------------------------------------------------
// Webhook HMAC verification (inbound Rapyd → OpalSwift)
// spec §4(a): EXCLUDE http_method from concatenation (differs from outbound)
// ---------------------------------------------------------------------------
async function verifyWebhookSignature(
  urlPath: string,
  salt: string,
  timestamp: string,
  accessKey: string,
  secretKey: string,
  bodyString: string,
  providedSignature: string,
): Promise<boolean> {
  // Webhook variant: method excluded — spec §4(a) "Webhook signature verification"
  const toSign = urlPath + salt + timestamp + accessKey + secretKey + bodyString;
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(toSign));
  const hexHash = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const computed = btoa(hexHash);

  // Constant-time comparison (prevent timing attacks)
  if (computed.length !== providedSignature.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ providedSignature.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// RapydAdapter
// ---------------------------------------------------------------------------
export class RapydAdapter implements IPaymentProvider {
  private readonly baseUrl: string;

  constructor(
    private readonly service: SupabaseClient,
    private readonly tenantId: string,
    private readonly creds: RapydCredentials,
  ) {
    // ⚠️ Critical: set once at instantiation from tenant config — never per-request
    this.baseUrl = creds.sandbox
      ? "https://sandboxapi.rapyd.net"
      : "https://api.rapyd.net";
  }

  // ── HTTP helper ─────────────────────────────────────────────────────────

  private async rapydFetch<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const bodyString = body ? JSON.stringify(body) : "";
    const headers = await buildRapydHeaders(
      method,
      path,
      bodyString,
      this.creds.accessKey,
      this.creds.secretKey,
    );

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: bodyString || undefined,
    });

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new PaymentProviderError(
        `Rapyd returned non-JSON response (HTTP ${res.status})`,
        "RAPYD_CHECKOUT_FAILED",
        res.status,
      );
    }

    const parsed = json as { status: RapydStatus; data?: unknown };
    if (!res.ok || parsed.status?.status === "ERROR") {
      throw new PaymentProviderError(
        parsed.status?.message ?? `Rapyd HTTP ${res.status}`,
        parsed.status?.error_code ?? "RAPYD_ERROR",
        res.status,
        parsed,
      );
    }

    return parsed.data as T;
  }

  // ── IPaymentProvider implementation ─────────────────────────────────────

  /**
   * createCheckout — POST /v1/checkout
   * Creates a PCI-compliant hosted payment page. OpalSwift never touches card data.
   * ⚠️ amount is passed as number (interface) but MUST be sent as string to Rapyd.
   */
  async createCheckout(amount: number, meta: PaymentMeta): Promise<CheckoutResponse> {
    const path = "/v1/checkout";

    // ⚠️ Decimal amounts MUST be sent as strings to avoid signature mismatch
    const amountStr = amount.toFixed(2);

    const body = {
      amount: amountStr, // "12.50" not 12.5
      currency: meta.currency,
      country: "IL",
      description: meta.description,
      merchant_reference_id: crypto.randomUUID(),
      metadata: {
        tenant_id: meta.tenantId,
        client_name: meta.clientName,
        client_email: meta.clientEmail ?? "",
        client_phone: meta.clientPhone ?? "",
      },
      complete_checkout_url: meta.successUrl,
      error_payment_url: meta.errorUrl,
      // escrow: NOT USED — OpalSwift does not hold funds in escrow (excluded by design)
    };

    const data = await this.rapydFetch<{
      id: string;
      redirect_url: string;
      status: string;
      page_expiration: number;
    }>("POST", path, body);

    return {
      checkoutId: data.id,
      redirectUrl: data.redirect_url,
      status: data.status === "ACT" ? "active" : "active",
      expiresAt: new Date(data.page_expiration * 1000).toISOString(),
    };
  }

  /**
   * handleWebhook — PA-1 applied: internal RapydWebhookPayload → opaque WebhookPayload mapping.
   * No caller outside this adapter sees RapydWebhookPayload.
   */
  async handleWebhook(payload: WebhookPayload): Promise<PaymentResult> {
    // payload is already the opaque interface from the webhook handler.
    // The internal Rapyd shape is captured in the raw_payload JSONB column.
    const data = payload.metadata as {
      id?: string;
      amount?: number;
      currency?: string;
      status?: string;
      metadata?: Record<string, unknown>;
    };

    const status = (() => {
      switch (data.status) {
        case "CLO": return "completed" as const;
        case "PEN": return "pending" as const;
        case "ERR": return "failed" as const;
        default:    return "pending" as const;
      }
    })();

    return {
      paymentId: data.id ?? payload.eventId,
      status,
      amount: String(data.amount ?? 0),
      currency: (data.currency ?? "ILS") as PaymentResult["currency"],
      tenantId: this.tenantId,
      metadata: payload.metadata,
      processedAt: payload.timestamp,
    };
  }

  /**
   * createSubscription — POST /v1/subscriptions
   * Requires pre-existing Rapyd customer_id (stored in tenant config).
   * See customer lifecycle in spec §3.2 before implementing Roster-tier recurring billing.
   */
  async createSubscription(plan: PlanParams): Promise<SubscriptionResponse> {
    const path = "/v1/subscriptions";

    if (!this.creds.customerId) {
      throw new PaymentProviderError(
        "Rapyd customer_id not set — create customer first via post-checkout flow",
        "RAPYD_CHECKOUT_FAILED",
      );
    }

    const body = {
      customer: this.creds.customerId,
      payment_method: plan.customerId, // payment method ID for this subscription
      subscription_items: [{ plan: plan.planId, quantity: 1 }],
      trial_period_days: plan.trialDays,
      metadata: { tenant_id: this.tenantId },
    };

    const data = await this.rapydFetch<{
      id: string;
      status: string;
      current_period_start: number;
      current_period_end: number;
      billing_cycle_anchor: number;
    }>("POST", path, body);

    return {
      subscriptionId: data.id,
      status: data.status === "active" ? "active" : "incomplete",
      currentPeriodStart: new Date(data.current_period_start * 1000).toISOString(),
      currentPeriodEnd: new Date(data.current_period_end * 1000).toISOString(),
      nextBillingDate: new Date(data.current_period_end * 1000).toISOString(),
    };
  }

  /**
   * chargeToken — POST /v1/payments
   * Charge a stored card token (recurring billing — Roster tier).
   * ⚠️ amount is number (interface) but MUST be sent as string.
   */
  async chargeToken(customerId: string, amount: number): Promise<ChargeResponse> {
    const path = "/v1/payments";

    const body = {
      amount: amount.toFixed(2), // MUST be string
      currency: "ILS",
      payment_method: customerId, // Rapyd payment method ID (stored token)
      customer: this.creds.customerId,
      capture: true,
      metadata: { tenant_id: this.tenantId },
    };

    const data = await this.rapydFetch<{
      id: string;
      status: string;
      amount: number;
      currency: string;
      created_at: number;
    }>("POST", path, body);

    return {
      transactionId: data.id,
      status: data.status === "CLO" ? "success" : "pending",
      amount: String(data.amount),
      currency: data.currency as ChargeResponse["currency"],
      processedAt: new Date(data.created_at * 1000).toISOString(),
    };
  }

  /**
   * issueRefund — POST /v1/refunds
   * Full or partial refund. Caller triggers Yesh credit note separately.
   * ⚠️ amount MUST be sent as string.
   */
  async issueRefund(paymentId: string, amount?: number): Promise<RefundResponse> {
    const path = "/v1/refunds";

    const body: Record<string, string> = {
      payment: paymentId,
      ...(amount !== undefined ? { amount: amount.toFixed(2) } : {}),
    };

    const data = await this.rapydFetch<{
      id: string;
      status: string;
      amount: number;
      currency: string;
      created_at: number;
      payment: string;
    }>("POST", path, body);

    return {
      refundId: data.id,
      status: data.status === "CLO" ? "completed" : "pending",
      amount: String(data.amount),
      currency: data.currency as RefundResponse["currency"],
      processedAt: new Date(data.created_at * 1000).toISOString(),
      originalPaymentId: data.payment,
    };
  }
}

// ---------------------------------------------------------------------------
// Rapyd webhook validation helper (used by rapyd-webhook edge function)
// ---------------------------------------------------------------------------

export interface RapydWebhookValidationParams {
  rawBody: string;
  headers: Headers;
  urlPath: string;
  accessKey: string;
  secretKey: string;
}

export async function validateRapydWebhook(
  params: RapydWebhookValidationParams,
): Promise<RapydWebhookPayload> {
  const salt = params.headers.get("salt");
  const timestamp = params.headers.get("timestamp");
  const signature = params.headers.get("signature");

  if (!salt || !timestamp || !signature) {
    throw new WebhookError(
      "Missing Rapyd webhook headers (salt/timestamp/signature)",
      "SIGNATURE_MISMATCH",
    );
  }

  // Timestamp replay-attack check (spec §4b): reject if > 60s old
  const tsNum = parseInt(timestamp, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (isNaN(tsNum) || nowSec - tsNum > 60) {
    throw new WebhookError(
      `Rapyd webhook timestamp too old (${nowSec - tsNum}s)`,
      "WEBHOOK_REPLAY_ATTACK",
    );
  }

  const valid = await verifyWebhookSignature(
    params.urlPath,
    salt,
    timestamp,
    params.accessKey,
    params.secretKey,
    params.rawBody,
    signature,
  );

  if (!valid) {
    throw new WebhookError(
      "Rapyd webhook signature mismatch",
      "SIGNATURE_MISMATCH",
    );
  }

  try {
    return JSON.parse(params.rawBody) as RapydWebhookPayload;
  } catch {
    throw new WebhookError("Rapyd webhook body is not valid JSON", "SIGNATURE_MISMATCH");
  }
}

// ---------------------------------------------------------------------------
// RapydAdapter factory helper — loads credentials from DB, instantiates adapter
// ---------------------------------------------------------------------------

export async function createRapydAdapter(
  service: SupabaseClient,
  tenantId: string,
): Promise<RapydAdapter> {
  const { data, error } = await service.rpc("get_tenant_rapyd_credentials", {
    p_tenant_id: tenantId,
  });

  if (error || !data?.[0]?.access_key || !data?.[0]?.secret_key) {
    throw new PaymentProviderError(
      "Rapyd credentials not configured for tenant",
      "TENANT_ONBOARDING_INCOMPLETE",
    );
  }

  const row = data[0] as {
    access_key: string;
    secret_key: string;
    webhook_secret: string;
    sandbox: boolean;
    customer_id: string | null;
  };

  return new RapydAdapter(service, tenantId, {
    accessKey: row.access_key,
    secretKey: row.secret_key,
    webhookSecret: row.webhook_secret,
    sandbox: row.sandbox,
    customerId: row.customer_id ?? undefined,
  });
}
