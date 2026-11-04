import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import type { TakbullApi, TakbullChargeTokenRequest, TakbullOrderRequest } from "../takbull/client.ts";
import { takbullPaymentPageUrl } from "../takbull/client.ts";
import { takbullApiForTenant } from "../takbull/index.ts";
import { MockTakbullApi } from "../takbull/mock.ts";
import {
  findTakbullChargeAttempt,
  insertPendingTakbullPayment,
  markTakbullOrderFailed,
  releaseTakbullChargeKey,
  setTakbullOrderRef,
  TakbullDuplicateChargeError,
} from "../takbull/pending-charge.ts";
import { processTakbullIpn } from "../takbull/process-ipn.ts";
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
 * Pure: the month a charge pays, from its key. Renewals: `renewal-<enrolment>-<YYYY-MM>` (with
 * `-a<attempt>` for Takbull); card links: `cardlink_<plan>_<YYYY-MM>`. Null for anything else.
 */
export function takbullChargePeriod(key: string | null | undefined): string | null {
  const match = /^(?:renewal-[0-9a-f-]{36}-|cardlink_[0-9a-f-]{36}_)(\d{4}-(?:0[1-9]|1[0-2]))(?:-a\d+)?$/.exec(key ?? "");
  return match ? match[1] : null;
}

/**
 * Pure: one key per renewal attempt. A first try and each dunning retry are separate charges;
 * the same attempt is never sent twice, even while Takbull's notice for it is still on its way.
 */
export function takbullRenewalKey(renewalKey: string, attemptCount: number): string {
  return `${renewalKey}-a${Math.max(0, Math.trunc(attemptCount))}`;
}

/** ChargeToken orderStatus that means the charge did not go through (order table in the docs). */
const TOKEN_ORDER_NOT_PAID = new Set([1, 5, 9]); // failed · cancelled · abandoned

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
  ipnUrl: string;
  successUrl: string;
  cancelUrl: string;
}): TakbullOrderRequest {
  const total = input.amountMinor / 100;
  const instalments = input.installments && input.installments > 1 ? Math.min(input.installments, 36) : 1;
  const currency = input.currency.toUpperCase();
  return {
    order_reference: input.paymentId,
    OrderTotalSum: total,
    RedirectAddress: input.successUrl,
    CancelReturnAddress: input.cancelUrl,
    IPNAddress: input.ipnUrl,
    DisplayType: "redirect",
    PostProcessMethod: "0",
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
 * Pure: the saved-card charge (ChargeToken). The same order as the page, without page-only
 * settings, plus the card. It names the notice URL, so its result comes back through
 * takbull-ipn and is checked there like any other payment.
 */
export function buildTakbullTokenCharge(
  input: Parameters<typeof buildTakbullOrder>[0] & { cardToken: string },
): TakbullChargeTokenRequest {
  const { DisplayType: _d, PostProcessMethod: _p, IsMobile: _m, PaymentMethodType: _t, DealType: _deal, MaxNumberOfPayments: _max, NumberOfPayments: _n, ...order } =
    buildTakbullOrder({ ...input, installments: 1 });
  return { ...order, CreditCard: { CardExternalToken: input.cardToken } };
}

/**
 * Takbull card payments (docs/plans/TAKBULL-INTEGRATION.md). A hosted Takbull page per payment
 * (PR 2), and monthly fees charged to the saved card (PR 3). The result arrives only through
 * the takbull-ipn function, which re-checks it with Takbull before anything settles.
 */
export class TakbullPaymentProvider implements PaymentProvider {
  readonly slug = "takbull";

  constructor(
    private readonly service: SupabaseClient,
    private readonly apiFor: (tenantId: string) => Promise<TakbullApi> = (tenantId) =>
      takbullApiForTenant(service, tenantId),
  ) {}

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    if (params.savedToken) return await this.chargeWithToken(params);
    const { metadata } = params;
    // First: no keys means "not configured" (checkout then falls back to pay at the studio).
    const api = await this.apiFor(metadata.tenant_id);

    // A card link pays one month: sending it again reuses the page still waiting to be paid.
    const period = takbullChargePeriod(params.idempotencyKey);
    const chargeKey = period ? params.idempotencyKey : null;
    if (chargeKey) {
      const existing = await findTakbullChargeAttempt(this.service, chargeKey);
      if (existing?.status === "pending" && existing.uniq_id) {
        return { providerPaymentRef: existing.uniq_id, pageUrl: takbullPaymentPageUrl(existing.uniq_id), pendingWebhook: true };
      }
      if (existing?.status === "succeeded") throw new TakbullDuplicateChargeError();
      if (existing) await releaseTakbullChargeKey(this.service, existing.payment_id);
    }

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
      chargeKey,
      paidForPeriod: period,
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
      ipnUrl: takbullIpnUrl(),
      successUrl: params.returnUrls?.success ?? appUrl("/enrol/complete"),
      cancelUrl: params.returnUrls?.failure ?? appUrl("/enrol/failed"),
    });

    let uniqId: string;
    try {
      ({ uniqId } = await api.getPaymentPageRedirectUrl(order));
    } catch (err) {
      await markTakbullOrderFailed(this.service, paymentId);
      throw err;
    }
    await setTakbullOrderRef(this.service, paymentId, uniqId);

    return { providerPaymentRef: uniqId, pageUrl: takbullPaymentPageUrl(uniqId), pendingWebhook: true };
  }

  /**
   * A month charged to the saved card (ChargeToken), with no client present. The payment is
   * pending until Takbull's notice is confirmed by takbull-ipn; a refusal here throws, so the
   * monthly run applies dunning. The same attempt (idempotencyKey) is never sent twice.
   */
  async chargeWithToken(params: ChargeParams): Promise<ChargeResult> {
    const { metadata } = params;
    if (!params.savedToken) throw new Error("Takbull: no saved card to charge");
    const api = await this.apiFor(metadata.tenant_id);

    const existing = await findTakbullChargeAttempt(this.service, params.idempotencyKey);
    if (existing && existing.status !== "failed") throw new TakbullDuplicateChargeError();
    if (existing) await releaseTakbullChargeKey(this.service, existing.payment_id);

    const { data: tenant } = await this.service
      .from("tenants")
      .select("language_default, takbull_document_type")
      .eq("id", metadata.tenant_id)
      .single();
    const payer = await loadPayer(this.service, metadata.billing_account_id);
    const { paymentId, ref } = await insertPendingTakbullPayment(this.service, {
      amountMinor: params.amountMinor,
      currency: params.currency,
      metadata,
      saveCard: false,
      chargeKey: params.idempotencyKey,
      paidForPeriod: takbullChargePeriod(params.idempotencyKey),
    });

    const request = buildTakbullTokenCharge({
      paymentId,
      amountMinor: params.amountMinor,
      currency: params.currency,
      language: tenant?.language_default === "en" ? "en" : "he",
      documentType: Number(tenant?.takbull_document_type) === 400 ? 400 : 320,
      payer,
      lineName: params.lineItem?.name ?? "Monthly fee",
      lineDescription: params.lineItem?.description,
      ipnUrl: takbullIpnUrl(),
      successUrl: params.returnUrls?.success ?? appUrl("/enrol/complete"),
      cancelUrl: params.returnUrls?.failure ?? appUrl("/enrol/failed"),
      cardToken: params.savedToken,
    });

    let result;
    try {
      result = await api.chargeToken(request);
    } catch (err) {
      await markTakbullOrderFailed(this.service, paymentId);
      throw err;
    }
    if (result.orderStatus !== undefined && TOKEN_ORDER_NOT_PAID.has(result.orderStatus)) {
      await markTakbullOrderFailed(this.service, paymentId);
      throw new Error(result.internalDescription || "Takbull: the card charge did not go through");
    }

    // Dev only: the in-memory Takbull sends its notice straight away (no network in the mock).
    if (env()?.get("TAKBULL_MOCK") === "true" && api instanceof MockTakbullApi && api.lastTokenOrder) {
      await processTakbullIpn(this.service, {
        uniqId: api.lastTokenOrder.uniqId,
        orderReference: paymentId,
        statusCode: 0,
        statusDescription: "OK",
        action: "Charge",
        transactionInternalNumber: api.lastTokenOrder.transactionInternalNumber,
      }, { apiFor: () => Promise.resolve(api) });
    }

    return { providerPaymentRef: ref, pendingWebhook: true };
  }

  /** Takbull notices go to the takbull-ipn function, never through handle-payment-event. */
  constructEvent(): Promise<PaymentEvent> {
    return Promise.reject(new Error("Takbull notices are handled by takbull-ipn"));
  }
}
