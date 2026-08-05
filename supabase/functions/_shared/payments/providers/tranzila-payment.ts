import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { TranzilaPaymentAdapter } from "./tranzila.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";
import { ChargeMetadataSchema } from "../types.ts";

/**
 * Tranzila payment adapter for the main provider architecture.
 *
 * Bridges the existing TranzilaPaymentAdapter (spec-compliant HMAC + hosted
 * checkout, ~490 lines) onto the PaymentProvider interface used by the enrolment
 * and checkout flow, so a tenant can actually select `payment_provider='tranzila'`.
 *
 * Credentials come from get_tenant_tranzila_credentials — the same encrypted-column
 * pattern every other provider uses. The underlying adapter expects a vault-style
 * SecretResolver, so we hand it one backed by that RPC rather than a separate vault.
 */

type TranzilaCredentials = {
  terminalName: string;
  appKey: string;
  secretKey: string;
};

export class TranzilaPaymentProvider implements PaymentProvider {
  readonly slug = "tranzila";

  constructor(private readonly service: SupabaseClient) {}

  private async getCredentials(tenantId: string): Promise<TranzilaCredentials> {
    const { data, error } = await this.service.rpc("get_tenant_tranzila_credentials", {
      p_tenant_id: tenantId,
    });
    const row = data?.[0] as
      | { terminal_name: string | null; app_key: string | null; secret_key: string | null }
      | undefined;

    if (error || !row?.terminal_name || !row.app_key || !row.secret_key) {
      throw new Error("Tranzila credentials not configured");
    }
    return {
      terminalName: row.terminal_name,
      appKey: row.app_key,
      secretKey: row.secret_key,
    };
  }

  /** Underlying adapter, wired to an RPC-backed secret resolver. */
  private async adapterFor(tenantId: string): Promise<TranzilaPaymentAdapter> {
    const creds = await this.getCredentials(tenantId);
    return new TranzilaPaymentAdapter({
      tenantId,
      terminalName: creds.terminalName,
      // The adapter resolves "…#app_key" / "…#secret_key" refs; serve them from the RPC
      // result instead of a vault so Tranzila matches the other providers' storage.
      secretResolver: {
        resolve: async (ref: string) =>
          ref.endsWith("#app_key") ? creds.appKey : creds.secretKey,
      },
      supabaseClient: this.service as unknown as { from: (t: string) => unknown },
    });
  }

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    const { metadata } = params;
    const adapter = await this.adapterFor(metadata.tenant_id);

    // Tranzila works in major units.
    const checkout = await adapter.createCheckout(params.amountMinor / 100, {
      tenantId: metadata.tenant_id,
      orderId: params.idempotencyKey,
      description: `${metadata.charge_type} payment ${metadata.engagement_id}`,
      currency: params.currency,
    } as never);

    const url = (checkout as { checkoutUrl?: string; url?: string }).checkoutUrl ??
      (checkout as { url?: string }).url;
    const ref = (checkout as { paymentId?: string; id?: string }).paymentId ??
      (checkout as { id?: string }).id ?? params.idempotencyKey;

    if (!url) {
      throw new Error("Tranzila createCheckout returned no checkout URL");
    }

    return { providerPaymentRef: ref, pageUrl: url, pendingWebhook: true };
  }

  /**
   * Tranzila posts its result to tranzila-payment-callback. The underlying adapter
   * owns signature/status verification; we map its result onto a PaymentEvent.
   */
  async constructEvent(rawBody: string, _headers: Headers, tenantId: string): Promise<PaymentEvent> {
    const adapter = await this.adapterFor(tenantId);
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    const result = await adapter.handleWebhook(parsed as never);

    const r = result as unknown as {
      status?: string;
      success?: boolean;
      paymentId?: string;
      amount?: number;
      metadata?: Record<string, string>;
    };
    const succeeded = r.success === true || r.status === "paid" || r.status === "succeeded";
    const meta = ChargeMetadataSchema.parse({
      tenant_id: tenantId,
      engagement_id: r.metadata?.engagement_id ?? "",
      billing_account_id: r.metadata?.billing_account_id ?? "",
      charge_type: (r.metadata?.charge_type as "initial" | "renewal") ?? "initial",
    });

    return {
      type: succeeded ? "payment.succeeded" : "payment.failed",
      providerPaymentRef: r.paymentId ?? "",
      metadata: meta,
      amountMinor: Math.round((r.amount ?? 0) * 100),
      currency: "ILS",
      pretaxAmountMinor: 0,
      vatAmountMinor: 0,
      vatRate: 0,
      failureMessage: succeeded ? undefined : "Tranzila payment failed",
    };
  }

  async refundCharge(params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }> {
    // Refunds need the tenant to resolve credentials; callers that have it should
    // prefer the tenant-scoped path. Kept explicit rather than silently no-op.
    throw new Error(
      "Tranzila refunds require a tenant-scoped call — use the adapter directly (see providers/tranzila.ts issueRefund).",
    );
  }

  async verifyCredentials(tenantId: string): Promise<{ valid: boolean; message: string }> {
    try {
      const creds = await this.getCredentials(tenantId);
      return {
        valid: true,
        message: `Tranzila credentials present for terminal ${creds.terminalName}.`,
      };
    } catch (error) {
      return { valid: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}
