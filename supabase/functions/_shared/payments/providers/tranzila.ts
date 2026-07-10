/**
 * tranzila.ts — TranzilaPaymentAdapter
 *
 * Implements IPaymentProvider for Tranzila payment gateway.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * ADAPTER MANDATE
 * This file MUST NOT be imported directly by edge functions or any caller outside
 * the providerFor*() factories in ./index.ts. Direct instantiation is prohibited.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * TAX DELEGATION DOCTRINE
 *   - price_type: 'G' on all items (VAT-inclusive; Tranzila reads rate from terminal config)
 *   - vat_percent NEVER passed to Tranzila
 *   - request_vat NEVER passed to Tranzila
 *   - OpalSwift never evaluates ITA thresholds
 *   - allocation_number = null if below ₪5,000 — null only, no reason metadata
 *
 * PCI SAQ A
 *   - Card capture is handled exclusively by Tranzila Hosted Fields / pr_link
 *   - tranzila_tokens stores opaque TK token IDs only — NEVER PAN, CVV, or expiry
 *
 * CREDENTIAL ISOLATION
 *   - Per-tenant: vault:secret/tenants/{tenantId}/tranzila#app_key / #secret_key
 *   - TRANZILA_STO_TERMINAL_NAME: platform-level env var (NOT per-tenant)
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
import type { SecretResolver } from "./index.ts";
import {
  mapTranzilaError,
  type TranzilaAuthHeaders,
  type TranzilaPayByLinkRequest,
  type TranzilaPayByLinkResponse,
  type PaymentLinkResult,
  type PaymentCallbackPayload,
  type STOParams,
  type STOUpdateParams,
  type STOResponse,
} from "./tranzila-types.ts";

// ── Constants ────────────────────────────────────────────────────────────────

const TRANZILA_API_BASE = "https://api.tranzila.com";
const REQUEST_TIMEOUT_MS = 5_000;
const RETRY_DELAYS_MS = [0, 200, 500]; // max 2 retries

// ── Config ────────────────────────────────────────────────────────────────────

export interface TranzilaAdapterConfig {
  tenantId:       string;
  /** Per-tenant terminal name from tenant_settings.tranzila_terminal_name */
  terminalName:   string;
  secretResolver: SecretResolver;
  /** Supabase client — required for chargeToken (tranzila_tokens lookup) */
  supabaseClient?: SupabaseLike;
}

interface SupabaseLike {
  from: (table: string) => any;
}

// ── HMAC helpers (Deno WebCrypto) ────────────────────────────────────────────

/** 80-char hex nonce: 40 random bytes — matches Tranzila PHP: bin2hex(random_bytes(40)) */
function generateNonce(): string {
  const bytes = new Uint8Array(40);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * HMAC-SHA256: message = app_key, key = secret + String(time) + nonce
 * Spec §2 corrected formula. String(time) ensures explicit string coercion (AF-3).
 */
async function generateHMAC(
  appKey: string,
  secret: string,
  time: number,
  nonce: string,
): Promise<string> {
  const encoder    = new TextEncoder();
  const keyData    = encoder.encode(secret + String(time) + nonce);
  const cryptoKey  = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(appKey));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── TranzilaPaymentAdapter ────────────────────────────────────────────────────

export class TranzilaPaymentAdapter implements IPaymentProvider {
  constructor(private readonly cfg: TranzilaAdapterConfig) {}

  // ── IPaymentProvider ──────────────────────────────────────────────────────

  async createCheckout(amount: number, meta: PaymentMeta): Promise<CheckoutResponse> {
    const { pr_id, pr_link } = await this._createPaymentLink(amount, meta);
    const expiresAt = new Date(
      Date.now() + (20 * 60 * 1000),
    ).toISOString();
    return {
      checkoutId:  pr_id,
      redirectUrl: pr_link,
      status:      "active",
      expiresAt,
    };
  }

  async handleWebhook(payload: WebhookPayload): Promise<PaymentResult> {
    const cb = this._parseCallback(payload.metadata);
    const success = String(cb.processor_response_code) === "000";
    return {
      paymentId:   cb.pr_id,
      status:      success ? "completed" : "failed",
      amount:      String(cb.amount ?? "0"),
      currency:    "ILS",
      tenantId:    this.cfg.tenantId,
      metadata:    {
        auth_number:    cb.auth_number,
        transaction_id: cb.transaction_id,
        error_code:     cb.error_code,
      },
      processedAt: new Date().toISOString(),
    };
  }

  async createSubscription(plan: PlanParams): Promise<SubscriptionResponse> {
    // Tranzila STO v2 — requires tokenId in plan metadata
    const tokenId = (plan as any).tokenId as string | undefined;
    if (!tokenId) {
      throw new Error(
        "STO_TOKEN_NOT_FOUND: token must be stored in tranzila_tokens before createSTO",
      );
    }
    const sto = await this.createSTO(tokenId, {
      first_charge_date: (plan as any).firstChargeDate ?? plan.billingCycle,
      charge_frequency:  "monthly",
      amount:            Number(plan.amount),
      currency:          "ILS",
      token_id:          tokenId,
    });
    const now = new Date().toISOString();
    return {
      subscriptionId:     sto.sto_id,
      status:             sto.status === "active" ? "active" : "incomplete",
      currentPeriodStart: now,
      currentPeriodEnd:   sto.next_charge_date ?? now,
      nextBillingDate:    sto.next_charge_date ?? now,
    };
  }

  async chargeToken(customerId: string, amount: number): Promise<ChargeResponse> {
    if (!this.cfg.supabaseClient) {
      throw new Error("supabaseClient required for chargeToken");
    }
    // Lookup opaque TK token — PCI SAQ A: token ID only, never PAN/CVV
    const { data, error } = await this.cfg.supabaseClient
      .from("tranzila_tokens")
      .select("tranzila_tk_token_id")
      .eq("tenant_id", this.cfg.tenantId)
      .eq("client_id", customerId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      throw new Error(`TRANZILA_TOKEN_NOT_FOUND: no active token for client ${customerId}`);
    }

    const stoTerminal = Deno.env.get("TRANZILA_STO_TERMINAL_NAME");
    if (!stoTerminal) {
      throw new Error("TRANZILA_STO_TERMINAL_NAME env var not set");
    }

    const headers = await this._buildHeaders();
    const res = await this._request<{
      error_code:     number;
      transaction_id?: string;
      amount?:        number;
      error_message?: string;
    }>(
      `${TRANZILA_API_BASE}/v2/sto/charge`,
      { terminal_name: stoTerminal, token_id: data.tranzila_tk_token_id, amount, currency: "ILS" },
      headers,
    );

    if (res.error_code !== 0) throw mapTranzilaError(res.error_code, res.error_message);

    // Update last_used_at
    await this.cfg.supabaseClient
      .from("tranzila_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("tenant_id", this.cfg.tenantId)
      .eq("tranzila_tk_token_id", data.tranzila_tk_token_id);

    return {
      transactionId: res.transaction_id ?? "",
      status:        "success",
      amount:        String(res.amount ?? amount),
      currency:      "ILS",
      processedAt:   new Date().toISOString(),
    };
  }

  async issueRefund(paymentId: string, amount?: number): Promise<RefundResponse> {
    // ⚠️ UNVERIFIED — confirm refund endpoint shape Day 1 (D2)
    const headers = await this._buildHeaders();
    const body: Record<string, unknown> = {
      terminal_name:  this.cfg.terminalName,
      transaction_id: paymentId,
    };
    if (amount !== undefined) body.amount = amount;

    const res = await this._request<{
      error_code:     number;
      refund_id?:     string;
      amount?:        number;
      error_message?: string;
    }>(`${TRANZILA_API_BASE}/v1/refund`, body, headers);

    if (res.error_code !== 0) throw mapTranzilaError(res.error_code, res.error_message);

    return {
      refundId:          res.refund_id ?? paymentId,
      status:            "completed",
      amount:            String(res.amount ?? amount ?? 0),
      currency:          "ILS",
      processedAt:       new Date().toISOString(),
      originalPaymentId: paymentId,
    };
  }

  // ── Tranzila-specific public methods ─────────────────────────────────────

  /**
   * createSTO — POST /v2/sto/create
   * Terminal: TRANZILA_STO_TERMINAL_NAME (platform env var, NOT per-tenant terminal).
   * Sequencing guard: tokenId MUST exist in tranzila_tokens before calling (spec §4).
   */
  async createSTO(tokenId: string, params: STOParams): Promise<STOResponse> {
    if (this.cfg.supabaseClient) {
      const { data } = await this.cfg.supabaseClient
        .from("tranzila_tokens")
        .select("id")
        .eq("tenant_id", this.cfg.tenantId)
        .eq("tranzila_tk_token_id", tokenId)
        .is("revoked_at", null)
        .single();
      if (!data) {
        throw new Error(
          "STO_TOKEN_NOT_FOUND: token must be stored in tranzila_tokens before createSTO",
        );
      }
    }

    const stoTerminal = Deno.env.get("TRANZILA_STO_TERMINAL_NAME");
    if (!stoTerminal) throw new Error("TRANZILA_STO_TERMINAL_NAME env var not set");

    const headers = await this._buildHeaders();
    const res = await this._request<STOResponse & { error_code: number; error_message?: string }>(
      `${TRANZILA_API_BASE}/v2/sto/create`,
      {
        terminal_name:     stoTerminal,
        token_id:          tokenId,
        first_charge_date: params.first_charge_date,
        charge_frequency:  "monthly",
        amount:            params.amount,
        currency:          "ILS",
      },
      headers,
    );

    if (res.error_code !== 0) throw mapTranzilaError(res.error_code, res.error_message);

    return { sto_id: res.sto_id, status: res.status, next_charge_date: res.next_charge_date };
  }

  /** updateSTO — POST /v2/sto/update */
  async updateSTO(stoId: string, params: STOUpdateParams): Promise<STOResponse> {
    const stoTerminal = Deno.env.get("TRANZILA_STO_TERMINAL_NAME");
    if (!stoTerminal) throw new Error("TRANZILA_STO_TERMINAL_NAME env var not set");

    const headers = await this._buildHeaders();
    const res = await this._request<STOResponse & { error_code: number; error_message?: string }>(
      `${TRANZILA_API_BASE}/v2/sto/update`,
      { terminal_name: stoTerminal, sto_id: stoId, ...params },
      headers,
    );

    if (res.error_code !== 0) throw mapTranzilaError(res.error_code, res.error_message);

    return { sto_id: res.sto_id, status: res.status, next_charge_date: res.next_charge_date };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async _createPaymentLink(
    amount: number,
    meta: PaymentMeta,
  ): Promise<PaymentLinkResult> {
    const headers    = await this._buildHeaders();
    const bookingId  = (meta as any).bookingId ?? crypto.randomUUID();
    const timestamp  = Date.now();

    const body: TranzilaPayByLinkRequest = {
      terminal_name:     this.cfg.terminalName,
      created_by_user:   "opalswift",
      created_by_system: "OpalSwift",
      created_via:       "TRAPI",
      request_date:      null,
      request_language:  (meta as any).language ?? "hebrew",
      response_language: "hebrew",
      client: {
        name:        meta.clientName,
        email:       meta.clientEmail ?? "",
        external_id: (meta as any).clientId,
      },
      items: [{
        name:          meta.description,
        unit_price:    amount,
        units_number:  1,
        type:          "S",
        price_type:    "G",   // VAT-inclusive — Tax Delegation Doctrine; never vat_percent
        currency_code: "ILS",
      }],
      payment_plans:   [1],
      payment_methods: (meta as any).paymentMethods ?? [1],
      payments_number: 1,
      // DCdisable deduplication token (spec §4, AF-4)
      user_defined_fields: [
        { name: "DCdisable", value: `${bookingId}_${timestamp}` },
      ],
      // NEVER include: request_vat, vat_percent
    };

    const result = await this._request<TranzilaPayByLinkResponse>(
      `${TRANZILA_API_BASE}/v1/pr/create`,
      body,
      headers,
    );

    if (result.error_code !== 0 || !result.pr_id || !result.pr_link) {
      throw mapTranzilaError(result.error_code ?? -1, result.error_message);
    }

    return { pr_id: result.pr_id, pr_link: result.pr_link };
  }

  /** Parse NOTIFY callback — accepts both form-encoded string and JSON object (Q5). */
  private _parseCallback(raw: unknown): PaymentCallbackPayload {
    let parsed: Record<string, unknown>;
    if (typeof raw === "string") {
      parsed = Object.fromEntries(new URLSearchParams(raw));
    } else if (typeof raw === "object" && raw !== null) {
      parsed = raw as Record<string, unknown>;
    } else {
      throw new Error("TRANZILA_CALLBACK_PARSE_ERROR: unrecognised payload format");
    }
    return {
      pr_id:                   String(parsed.pr_id ?? ""),
      processor_response_code: String(parsed.processor_response_code ?? ""),
      error_code:              Number(parsed.error_code ?? -1),
      amount:      parsed.amount      !== undefined ? Number(parsed.amount)      : undefined,
      transaction_id: parsed.transaction_id !== undefined ? String(parsed.transaction_id) : undefined,
      auth_number: parsed.auth_number !== undefined ? String(parsed.auth_number) : undefined,
    };
  }

  /**
   * Build Tranzila auth headers — credentials resolved per-tenant from vault.
   * vault:secret/tenants/{tenantId}/tranzila#app_key
   * vault:secret/tenants/{tenantId}/tranzila#secret_key
   */
  private async _buildHeaders(): Promise<TranzilaAuthHeaders> {
    const { tenantId, secretResolver } = this.cfg;
    const appKey    = await secretResolver.resolve(
      `vault:secret/tenants/${tenantId}/tranzila#app_key`,
    );
    const secretKey = await secretResolver.resolve(
      `vault:secret/tenants/${tenantId}/tranzila#secret_key`,
    );
    const time  = Math.floor(Date.now() / 1000);
    const nonce = generateNonce();
    const token = await generateHMAC(appKey, secretKey, time, nonce);
    return {
      "X-tranzila-api-app-key":      appKey,
      "X-tranzila-api-access-token": token,
      "X-tranzila-api-request-time": time.toString(),
      "X-tranzila-api-nonce":        nonce,
    };
  }

  /**
   * Generic HTTP client.
   *
   * Retry policy (spec §4):
   *   - Max 2 retries, delays: 200ms then 500ms.
   *   - Idempotent operations only: GET + createPaymentLink (DCdisable deduplication).
   *   - Abort on 5-second timeout (no retry after abort).
   *
   * ⚠️ IMPORTANT: createInvoice() MUST NOT use this method.
   *    Invoice creation is handled by TranzilaInvoicingAdapter._requestNoRetry().
   */
  private async _request<T>(
    url:     string,
    body:    Record<string, unknown>,
    headers: TranzilaAuthHeaders,
  ): Promise<T> {
    const reqHeaders = {
      "Content-Type": "application/json",
      ...headers,
    } as Record<string, string>;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      if (RETRY_DELAYS_MS[attempt] > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
      try {
        const ctrl    = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
        try {
          const res = await fetch(url, {
            method:  "POST",
            headers: reqHeaders,
            body:    JSON.stringify(body),
            signal:  ctrl.signal,
          });
          return await res.json() as T;
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError.name === "AbortError") break; // do not retry on timeout
      }
    }

    throw lastError ?? new Error("TRANZILA_REQUEST_FAILED");
  }
}
