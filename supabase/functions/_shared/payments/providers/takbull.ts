import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import type { TakbullApi, TakbullOrderRequest, TakbullRefundRequest } from "../takbull/client.ts";
import { ManualRefundRequiredError } from "../refund-errors.ts";
import { takbullPaymentPageUrl } from "../takbull/client.ts";
import { takbullApiForTenant } from "../takbull/index.ts";
import { insertPendingTakbullPayment, markTakbullOrderFailed, setTakbullOrderRef } from "../takbull/pending-charge.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";

type Env = { get(k: string): string | undefined };
const env = (): Env | undefined => (globalThis as { Deno?: { env: Env } }).Deno?.env;

/** Where Takbull sends the payment notice (the takbull-ipn function). */
export function takbullIpnUrl(): string {
  const supabaseUrl = env()?.get("SUPABASE_URL")?.trim();
  if (!supabaseUrl) throw new Error("SUPABASE_URL is not set: required for the Takbull notice URL");
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/takbull-ipn`;
}

function appUrl(path: string): string {
  const base = env()?.get("APP_URL")?.trim();
  if (!base) throw new Error("APP_URL is not set: required for the Takbull return URLs");
  return `${base.replace(/\/+$/, "")}${path}`;
}

/**
 * Pure: the Refund request (docs: RefundType 2 "Cancel with document", 4 "Partial refund with
 * document"; RefundAmount "Required for partial refund"). The whole payment, with nothing
 * refunded before, cancels the deal with its document; anything else is a partial refund with
 * its document, for the amount asked.
 */
export function buildTakbullRefund(input: {
  transactionInternalNumber: string;
  amountMinor: number;
  totalMinor: number;
  alreadyRefundedMinor: number;
  comments?: string;
}): TakbullRefundRequest {
  const whole = input.alreadyRefundedMinor <= 0 && input.amountMinor === input.totalMinor;
  return {
    RefundType: whole ? 2 : 4,
    RefundAmount: whole ? null : input.amountMinor / 100,
    TransactionInternalNumber: input.transactionInternalNumber,
    ...(input.comments ? { Comments: input.comments.slice(0, 200) } : {}),
  };
}

/** Takbull's transaction number (digits), stored as provider_payment_ref when a payment settles. */
function isTakbullTransactionNumber(ref: string): boolean {
  return /^\d+$/.test(ref);
}

export interface TakbullPayer {
  name: string;
  email: string | null;
  phone: string | null;
  identityNumber: string | null;
}

/**
 * Pure: the order Takbull's payment page is created from.
 *  - order_reference is our payment id, so every notice maps to one row we already hold.
 *  - Instalments ask for DealType 2 with the most payments allowed; otherwise a regular deal.
 *    The card token comes back on every approved card transaction (no flag needed).
 *  - The document is issued with the charge (CreateDocument), as the studio's chosen type.
 */
export function buildTakbullOrder(input: {
  paymentId: string;
  amountMinor: number;
  currency: string;
  language: "he" | "en";
  documentType: number;
  payer: TakbullPayer;
  lineName: string;
  lineDescription?: string;
  installments?: number;
  /** Bit (PaymentMethodType 21); on a phone, IsMobile asks for the link that opens the Bit app. */
  payWith?: "bit";
  isMobile?: boolean;
  ipnUrl: string;
  successUrl: string;
  cancelUrl: string;
}): TakbullOrderRequest {
  const total = input.amountMinor / 100;
  const bit = input.payWith === "bit";
  // Bit is one payment: the docs give instalments (DealType 2) for the card page only.
  const instalments = !bit && input.installments && input.installments > 1 ? Math.min(input.installments, 36) : 1;
  const currency = input.currency.toUpperCase();
  return {
    order_reference: input.paymentId,
    OrderTotalSum: total,
    RedirectAddress: input.successUrl,
    CancelReturnAddress: input.cancelUrl,
    IPNAddress: input.ipnUrl,
    DisplayType: "redirect",
    PostProcessMethod: "0",
    ...(bit ? { PaymentMethodType: 21 as const, ...(input.isMobile ? { IsMobile: true } : {}) } : {}),
    Language: input.language,
    ...(currency === "ILS" || currency === "USD" || currency === "EUR" ? { Currency: currency } : {}),
    CustomerFullName: input.payer.name,
    ...(input.payer.phone ? { CustomerPhoneNumber: input.payer.phone } : {}),
    Customer: {
      CustomerFullName: input.payer.name,
      ...(input.payer.email ? { Email: input.payer.email } : {}),
      ...(input.payer.phone ? { PhoneNumber: input.payer.phone } : {}),
      ...(input.payer.identityNumber ? { IdentityNumber: input.payer.identityNumber } : {}),
    },
    DealType: instalments > 1 ? 2 : 1,
    ...(instalments > 1 ? { MaxNumberOfPayments: instalments, NumberOfPayments: 1 } : {}),
    CreateDocument: true,
    DocumentType: input.documentType,
    Products: [
      {
        ProductName: input.lineName,
        Description: input.lineDescription ?? input.lineName,
        Price: total,
        Quantity: 1,
      },
    ],
  };
}

/** The payer on the order: the billing account's contact person (name, email, phone, ID). */
async function loadPayer(service: SupabaseClient, billingAccountId: string): Promise<TakbullPayer> {
  const { data: account } = await service
    .from("billing_accounts")
    .select("person_id, account_id, business_tax_id")
    .eq("id", billingAccountId)
    .maybeSingle();
  let personId = (account?.person_id as string | null) ?? null;
  if (!personId && account?.account_id) {
    const { data: acc } = await service.from("accounts").select("person_id").eq("id", account.account_id as string).maybeSingle();
    personId = (acc?.person_id as string | null) ?? null;
  }
  if (!personId) throw new Error(`Takbull: billing account ${billingAccountId} has no contact person`);
  const { data: person } = await service
    .from("people")
    .select("name, email, emergency_contact_phone")
    .eq("id", personId)
    .maybeSingle();
  return {
    name: (person?.name as string | null)?.trim() || "Client",
    email: (person?.email as string | null)?.trim() || null,
    // people has no own phone column: a guardian's number lives in emergency_contact_phone.
    phone: (person?.emergency_contact_phone as string | null)?.trim() || null,
    identityNumber: (account?.business_tax_id as string | null)?.trim() || null,
  };
}

/**
 * Takbull card payments (docs/plans/TAKBULL-INTEGRATION.md, PR 2). A hosted Takbull page per
 * payment; the result arrives only through the takbull-ipn function, which re-checks it with
 * Takbull before anything settles. Refunds go through Refund (PR 4); saved-card charges come in PR 3.
 */
export class TakbullPaymentProvider implements PaymentProvider {
  readonly slug = "takbull";

  constructor(
    private readonly service: SupabaseClient,
    private readonly apiFor: (tenantId: string) => Promise<TakbullApi> = (tenantId) =>
      takbullApiForTenant(service, tenantId),
  ) {}

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    if (params.savedToken) {
      throw new Error("Takbull saved-card charges go through chargeWithToken (not built yet)");
    }
    const { metadata } = params;
    // First: no keys means "not configured" (checkout then falls back to pay at the studio).
    const api = await this.apiFor(metadata.tenant_id);

    const { data: tenant } = await this.service
      .from("tenants")
      .select("language_default, takbull_document_type")
      .eq("id", metadata.tenant_id)
      .single();
    const payer = await loadPayer(this.service, metadata.billing_account_id);
    const saveCard = metadata.charge_type === "initial" || params.saveCard === true || metadata.save_card === "1";
    const { paymentId } = await insertPendingTakbullPayment(this.service, {
      amountMinor: params.amountMinor,
      currency: params.currency,
      metadata,
      saveCard,
    });

    const order = buildTakbullOrder({
      paymentId,
      amountMinor: params.amountMinor,
      currency: params.currency,
      language: tenant?.language_default === "en" ? "en" : "he",
      documentType: Number(tenant?.takbull_document_type) === 400 ? 400 : 320,
      payer,
      lineName: params.lineItem?.name ?? "Enrolment",
      lineDescription: params.lineItem?.description,
      installments: params.installments,
      payWith: params.payWith,
      isMobile: params.isMobile,
      ipnUrl: takbullIpnUrl(),
      successUrl: params.returnUrls?.success ?? appUrl("/enrol/complete"),
      cancelUrl: params.returnUrls?.failure ?? appUrl("/enrol/failed"),
    });

    let uniqId: string;
    let bitAppUrl: string | undefined;
    try {
      ({ uniqId, url: bitAppUrl } = await api.getPaymentPageRedirectUrl(order));
    } catch (err) {
      await markTakbullOrderFailed(this.service, paymentId);
      throw err;
    }
    await setTakbullOrderRef(this.service, paymentId, uniqId);

    // Bit on a phone: Takbull's link opens the Bit app; otherwise its payment page.
    const pageUrl = params.payWith === "bit" && params.isMobile && bitAppUrl ? bitAppUrl : takbullPaymentPageUrl(uniqId);
    return { providerPaymentRef: uniqId, pageUrl, pendingWebhook: true };
  }

  /**
   * Refund through Takbull (Refund), with Takbull's credit document. It needs Takbull's
   * transactionInternalNumber, which takbull-ipn stores as provider_payment_ref on settle.
   */
  async refundCharge(params: { providerPaymentRef: string; amountMinor: number }): Promise<{ providerRefundRef: string }> {
    const { data: payment } = await this.service
      .from("payments")
      .select("id, tenant_id, total_amount_minor, refund_amount_minor")
      .eq("provider_payment_ref", params.providerPaymentRef)
      .eq("provider", "takbull")
      .maybeSingle();
    if (!payment?.tenant_id) throw new Error("Payment not found for refund");
    if (!isTakbullTransactionNumber(params.providerPaymentRef)) {
      throw new ManualRefundRequiredError(
        "takbull",
        "This Takbull payment has no Takbull transaction number on record. Refund it in Takbull, " +
          "then record the refund here.",
      );
    }
    const api = await this.apiFor(payment.tenant_id as string);
    // Throws (TakbullApiError) unless Takbull answers internalCode 0.
    const result = await api.refund(buildTakbullRefund({
      transactionInternalNumber: params.providerPaymentRef,
      amountMinor: params.amountMinor,
      totalMinor: Number(payment.total_amount_minor),
      alreadyRefundedMinor: Number(payment.refund_amount_minor ?? 0),
    }));
    const ref = result.documentId ? `takbull_doc_${result.documentId}` : `takbull_refund_${params.providerPaymentRef}_${Date.now()}`;
    return { providerRefundRef: ref };
  }

  /** Takbull notices go to the takbull-ipn function, never through handle-payment-event. */
  constructEvent(): Promise<PaymentEvent> {
    return Promise.reject(new Error("Takbull notices are handled by takbull-ipn"));
  }
}
