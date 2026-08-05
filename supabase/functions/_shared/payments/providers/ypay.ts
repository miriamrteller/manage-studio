import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getYpayAccessToken, ypayPost, ypayVerifyAccessToken, YpayApiError } from "../ypay/client.ts";
import { getYpayCredentials } from "../ypay/credentials.ts";
import { resolveYpayCustomer } from "../ypay/customer.ts";
import {
  insertPendingYpayPayment,
  loadYpayPaymentByRef,
} from "../ypay/pending-charge.ts";
import { parseYpayCallback, peekYpayChargeIdentifier } from "../ypay/callback.ts";
import { verifyYpayTransaction } from "../ypay/verify-callback.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";

/**
 * YPay payment adapter — live (API v1.9).
 *
 * Hosted flow: POST /payment returns a UPAY-backed redirect URL; the outcome arrives
 * asynchronously on notifyUrl. A pending payment row is inserted before the redirect
 * (D5). The tax document is issued by YPay bundled with the charge (docType 109).
 *
 * NOT SUPPORTED by the YPay API: saved-card tokenization and refunds. chargeWithToken
 * and refundCharge therefore throw. This means a YPay tenant cannot run unattended
 * monthly token renewals — YPay covers one-time and installment payments only.
 */

/** docType 109 = invoice-receipt (חשבונית מס קבלה). */
const DOC_TYPE_INVOICE_RECEIPT = 109;

function resolveNotifyUrl(): string {
  const env = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env;
  const explicit = env?.get("YPAY_NOTIFY_URL")?.trim();
  if (explicit) return explicit;

  const supabaseUrl = env?.get("SUPABASE_URL")?.trim();
  if (!supabaseUrl) {
    throw new Error("YPAY_NOTIFY_URL is not set and SUPABASE_URL is unavailable to derive it");
  }
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/handle-payment-event`;
}

function resolveAppUrl(path: string): string {
  const env = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env;
  const appUrl = env?.get("APP_URL")?.trim();
  if (!appUrl) throw new Error("APP_URL is not set — required for YPay success/failure URLs");
  return `${appUrl.replace(/\/+$/, "")}${path}`;
}

export class YpayPaymentProvider implements PaymentProvider {
  readonly slug = "ypay";

  constructor(private readonly service: SupabaseClient) {}

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    if (params.savedToken) {
      throw new YpayApiError(
        "YPay does not support saved-token charges — its API has no tokenization (see providers/ypay.ts).",
      );
    }

    const { metadata } = params;
    const credentials = await getYpayCredentials(this.service, metadata.tenant_id);
    const token = await getYpayAccessToken(this.service, metadata.tenant_id, credentials);
    const customer = await resolveYpayCustomer(this.service, metadata.billing_account_id);

    // chargeIdentifier must be unique per charge (YPay error 4001 otherwise).
    const chargeIdentifier = crypto.randomUUID();

    await insertPendingYpayPayment(this.service, {
      chargeIdentifier,
      amountMinor: params.amountMinor,
      currency: params.currency,
      metadata,
    });

    const totalMajor = params.amountMinor / 100;
    const payload = await ypayPost("payment", token, {
      chargeIdentifier,
      payments: params.installments && params.installments > 1 ? params.installments : 1,
      docType: DOC_TYPE_INVOICE_RECEIPT,
      mail: true,
      signDoc: true,
      lang: "he",
      currency: params.currency.toUpperCase(),
      contact: {
        email: customer.email,
        name: customer.name,
        ...(customer.phone ? { mobile: customer.phone } : {}),
        ...(customer.businessId ? { businessID: customer.businessId } : {}),
      },
      items: [
        {
          price: totalMajor,
          quantity: 1,
          vatIncluded: true,
          name: "enrolment",
          description: `${metadata.charge_type} payment`,
        },
      ],
      notifyUrl: resolveNotifyUrl(),
      successUrl: resolveAppUrl("/enrol/complete"),
      failureUrl: resolveAppUrl("/enrol/failed"),
    });

    const redirectUrl = payload.url;
    if (typeof redirectUrl !== "string" || redirectUrl === "") {
      throw new YpayApiError("YPay /payment returned no redirect URL");
    }

    return {
      providerPaymentRef: chargeIdentifier,
      pageUrl: redirectUrl,
      pendingWebhook: true,
    };
  }

  /**
   * Parse AND verify a hosted callback. YPay signs nothing, so a success claim is
   * confirmed against getTransactionsInfo before it settles; failure raises and the
   * payment stays pending.
   */
  async constructEvent(rawBody: string, _headers: Headers, tenantId: string): Promise<PaymentEvent> {
    const chargeIdentifier = peekYpayChargeIdentifier(rawBody);
    if (!chargeIdentifier) {
      throw new Error("YPay callback missing chargeIdentifier");
    }

    const pending = await loadYpayPaymentByRef(this.service, chargeIdentifier);
    if (!pending) {
      throw new Error(`YPay callback references unknown charge ${chargeIdentifier}`);
    }
    if (pending.tenant_id !== tenantId) {
      throw new Error(`YPay callback tenant mismatch for charge ${chargeIdentifier}`);
    }

    const parsed = parseYpayCallback(rawBody, chargeIdentifier, {
      tenant_id: pending.tenant_id,
      engagement_id: pending.engagement_id ?? "",
      billing_account_id: pending.billing_account_id ?? "",
      charge_type: (pending.charge_type as "initial" | "renewal") ?? "initial",
    });

    if (parsed.event.type !== "payment.succeeded") {
      return parsed.event;
    }

    const outcome = await verifyYpayTransaction({
      service: this.service,
      tenantId: pending.tenant_id,
      transactionId: parsed.transactionId as string,
      expectedAmountMinor: parsed.event.amountMinor,
    });

    if (!outcome.verified) {
      throw new Error(
        `YPay success callback for charge ${chargeIdentifier} could not be verified: ${outcome.reason}`,
      );
    }

    return parsed.event;
  }

  async chargeWithToken(_params: ChargeParams): Promise<ChargeResult> {
    throw new YpayApiError(
      "YPay has no tokenization — unattended token renewals are not supported (see providers/ypay.ts).",
    );
  }

  async refundCharge(_params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }> {
    throw new YpayApiError("YPay refunds are not exposed by the API — process refunds in the YPay dashboard.");
  }

  async verifyCredentials(tenantId: string): Promise<{ valid: boolean; message: string }> {
    try {
      const credentials = await getYpayCredentials(this.service, tenantId);
      await ypayVerifyAccessToken(credentials);
      return { valid: true, message: "YPay credentials accepted." };
    } catch (error) {
      return { valid: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}
