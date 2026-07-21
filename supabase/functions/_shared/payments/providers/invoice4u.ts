import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { parseInvoice4uCallback, peekInvoice4uOrderId } from "../invoice4u/callback.ts";
import {
  insertPendingInvoice4uPayment,
  loadPaymentByProviderRef,
} from "../invoice4u/pending-charge.ts";
import { invoice4uApiBase, invoice4uIsQaMode, invoice4uPost } from "../invoice4u/client.ts";
import { resolveInvoice4uCustomer } from "../invoice4u/customer.ts";
import { verifyInvoice4uPaymentSucceeded } from "../invoice4u/verify-callback.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";

/**
 * Invoice4U payment adapter — live (U2b).
 *
 * Hosted flow: ProcessApiRequestV2 returns a ClearingRedirectUrl the customer is sent
 * to; the result arrives asynchronously on CallBackUrl. A pending payment row is
 * inserted BEFORE the redirect (D5) so the callback has something to reconcile against.
 *
 * Renewals (ChargeWithToken) and refunds are U4-live and deliberately not implemented
 * here — see stage-u4-live.md.
 */

type Invoice4uCredentials = {
  apiKey: string;
  /** CreditCardCompanyType: 6=UPay, 7=Meshulam, 12=YaadSarig, 15=Cardcom. */
  clearingCompanyType: number;
};

function resolveNotifyUrl(): string {
  const explicit = Deno.env.get("INVOICE4U_NOTIFY_URL")?.trim();
  if (explicit) return explicit;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  if (!supabaseUrl) {
    throw new Error(
      "INVOICE4U_NOTIFY_URL is not set and SUPABASE_URL is unavailable to derive it",
    );
  }
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/handle-payment-event`;
}

function resolveReturnUrl(): string {
  const appUrl = Deno.env.get("APP_URL")?.trim();
  if (!appUrl) {
    throw new Error("APP_URL is not set — required for the Invoice4U ReturnUrl");
  }
  return `${appUrl.replace(/\/+$/, "")}/enrol/complete`;
}

export class Invoice4uPaymentProvider implements PaymentProvider {
  readonly slug = "invoice4u";

  constructor(private readonly service: SupabaseClient) {}

  private async getCredentials(tenantId: string): Promise<Invoice4uCredentials> {
    const { data: creds, error } = await this.service.rpc("get_tenant_payment_credentials", {
      p_tenant_id: tenantId,
    });
    if (error || !creds?.[0]?.payment_provider_secret_key) {
      throw new Error("Invoice4U credentials not configured");
    }

    const cred = creds[0] as {
      payment_provider_public_key: string | null;
      payment_provider_secret_key: string;
    };

    // Clearing company type is stored in the vendor-generic public-key column
    // (save_tenant_invoice4u_credentials maps p_clearing_company_type there).
    const clearingCompanyType = Number(cred.payment_provider_public_key);
    if (!Number.isFinite(clearingCompanyType) || clearingCompanyType <= 0) {
      throw new Error(
        "Invoice4U clearing company type not configured (expected 6=UPay, 7=Meshulam, 12=YaadSarig, 15=Cardcom)",
      );
    }

    return { apiKey: cred.payment_provider_secret_key, clearingCompanyType };
  }

  /**
   * Hosted charge. Inserts the pending row first (D5) so a callback arriving before
   * this method returns still has a row to match.
   */
  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    if (params.savedToken) {
      throw new Error(
        "Invoice4U saved-token charges are U4-live — see docs/plans/finance/invoice4u/stage-u4-live.md",
      );
    }

    const { metadata } = params;
    const credentials = await this.getCredentials(metadata.tenant_id);

    // ProcessApiRequestV2 needs CustomerId, or FullName + Phone. A first hosted charge
    // has no CustomerId, so resolve the payer before creating anything.
    const customer = params.customerRef
      ? null
      : await resolveInvoice4uCustomer(this.service, metadata.billing_account_id);

    const orderId = crypto.randomUUID();

    await insertPendingInvoice4uPayment(this.service, {
      orderId,
      amountMinor: params.amountMinor,
      currency: params.currency,
      metadata,
    });

    const payload = await invoice4uPost("ProcessApiRequestV2", {
      request: {
        Invoice4UUserApiKey: credentials.apiKey,
        CreditCardCompanyType: credentials.clearingCompanyType,
        // Invoice4U takes a major-unit decimal, not minor units.
        Sum: params.amountMinor / 100,
        Currency: params.currency,
        OrderIdClientUsage: orderId,
        CallBackUrl: resolveNotifyUrl(),
        ReturnUrl: resolveReturnUrl(),
        // Capture a reusable token alongside the charge so renewals (U4-live) do not
        // need the customer present again.
        AddTokenAndCharge: true,
        IsAutoCreateCustomer: true,
        // Bundled tax document — Invoice4U issues it with the payment; there is no
        // standalone issuance path for this provider.
        IsDocCreate: true,
        IsQaMode: invoice4uIsQaMode(),
        ...(params.customerRef
          ? { CustomerId: params.customerRef }
          : {
              FullName: customer!.fullName,
              Email: customer!.email ?? undefined,
              Phone: customer!.phone ?? undefined,
            }),
      },
    });

    const redirectUrl = payload.ClearingRedirectUrl;
    if (typeof redirectUrl !== "string" || redirectUrl === "") {
      throw new Error(
        "Invoice4U ProcessApiRequestV2 returned no ClearingRedirectUrl (check the clearing terminal is attached)",
      );
    }

    return {
      providerPaymentRef: orderId,
      pageUrl: redirectUrl,
      pendingWebhook: true,
    };
  }

  /**
   * Parses AND verifies a hosted callback.
   *
   * Invoice4U signs nothing, so the body alone proves nothing: the callback URL is
   * public and the customer knows their own OrderId. Every success is confirmed
   * against the provider's clearing log before it is allowed to settle. Verification
   * failure raises — the payment stays pending rather than settling unverified.
   */
  async constructEvent(rawBody: string, _headers: Headers, tenantId: string): Promise<PaymentEvent> {
    const orderId = peekInvoice4uOrderId(rawBody);
    if (!orderId) {
      throw new Error("Invoice4U callback missing OrderIdClientUsage");
    }

    const pending = await loadPaymentByProviderRef(this.service, orderId);
    if (!pending) {
      throw new Error(`Invoice4U callback references unknown order ${orderId}`);
    }
    if (pending.tenant_id !== tenantId) {
      throw new Error(`Invoice4U callback tenant mismatch for order ${orderId}`);
    }

    const parsed = parseInvoice4uCallback(rawBody, {
      tenant_id: pending.tenant_id,
      engagement_id: pending.engagement_id ?? "",
      billing_account_id: pending.billing_account_id ?? "",
      charge_type: (pending.charge_type as "initial" | "renewal") ?? "initial",
    });

    // A failure claim needs no verification — it grants nothing.
    if (parsed.event.type !== "payment.succeeded") {
      return parsed.event;
    }

    const credentials = await this.getCredentials(pending.tenant_id);
    const outcome = await verifyInvoice4uPaymentSucceeded({
      apiKey: credentials.apiKey,
      paymentId: parsed.event.providerPaymentRef,
      expectedAmountMinor: parsed.event.amountMinor,
    });

    if (!outcome.verified) {
      throw new Error(
        `Invoice4U success callback for order ${orderId} could not be verified: ${outcome.reason}`,
      );
    }

    return parsed.event;
  }

  async chargeWithToken(_params: ChargeParams): Promise<ChargeResult> {
    throw new Error(
      "Invoice4U chargeWithToken is U4-live — see docs/plans/finance/invoice4u/stage-u4-live.md",
    );
  }

  async refundCharge(_params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }> {
    throw new Error(
      "Invoice4U refundCharge is U4-live — see docs/plans/finance/invoice4u/stage-u4-live.md",
    );
  }

  /** Credential check for the admin settings screen — IsAuthenticated. */
  async verifyCredentials(tenantId: string): Promise<{ valid: boolean; message: string }> {
    let apiKey: string;
    try {
      apiKey = (await this.getCredentials(tenantId)).apiKey;
    } catch (error) {
      return { valid: false, message: error instanceof Error ? error.message : String(error) };
    }

    try {
      await invoice4uPost("IsAuthenticated", { token: apiKey });
      return {
        valid: true,
        message: `Invoice4U credentials accepted (${invoice4uIsQaMode() ? "QA" : "production"}: ${invoice4uApiBase()}).`,
      };
    } catch (error) {
      return { valid: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}
