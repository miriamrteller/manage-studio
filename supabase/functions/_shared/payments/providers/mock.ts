import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { buildMockIpnFromCharge } from "../icount/mock-api.ts";
import { buildMockPaymentEvent } from "../mock-payment-event.ts";
import type { ChargeMetadata, ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";
import { ChargeMetadataSchema } from "../types.ts";
import { MockIcountPaymentProvider } from "./mock-icount.ts";

export const MOCK_PAYMENT_DECLINED_CODE = "MOCK_PAYMENT_DECLINED";

/** Grow simulator decline test PAN (reused for mock UX in G0). */
export const MOCK_DECLINE_CARD_SUFFIX = "4580000000000000";

export type MockPaymentScenario = "success" | "decline";

export class MockPaymentProvider implements PaymentProvider {
  readonly slug = "mock";

  /** Reserves a mock intent only — finalisation happens in confirm-mock-payment. */
  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    const providerPaymentRef = `mock_pi_${crypto.randomUUID()}`;
    return {
      clientSecret: providerPaymentRef,
      providerPaymentRef,
    };
  }

  async constructEvent(rawBody: string, headers: Headers, _tenantId: string): Promise<PaymentEvent> {
    const mockSig = headers.get("x-mock-signature");
    if (mockSig !== "mock-valid") {
      throw new Error("Invalid mock signature");
    }
    const parsed = JSON.parse(rawBody) as PaymentEvent;
    ChargeMetadataSchema.parse(parsed.metadata);
    return parsed;
  }

  async refundCharge(params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }> {
    return { providerRefundRef: `mock_ref_${params.providerPaymentRef}_${params.amountMinor}` };
  }
}

export interface ConfirmMockPaymentParams {
  service: SupabaseClient;
  metadata: ChargeMetadata;
  amountMinor: number;
  currency: string;
  scenario: MockPaymentScenario;
  providerPaymentRef?: string;
  /** Defaults to `mock`; use `grow` or `icount` when confirming mock hosted-page charges. */
  providerSlug?: string;
  /** Saves a default card token for confirmation emails (mock / GROW_MOCK flows). */
  mockCardNumber?: string;
}

function cardBrandFromNumber(cardNumber: string): string {
  const digit = cardNumber.replace(/\s/g, "")[0];
  if (digit === "4") return "Visa";
  if (digit === "5") return "Mastercard";
  return "Card";
}

async function saveMockCardToken(
  service: SupabaseClient,
  metadata: ChargeMetadata,
  cardNumber: string,
  providerSlug: string,
): Promise<void> {
  const normalized = cardNumber.replace(/\s/g, "");
  const last4 = normalized.length >= 4 ? normalized.slice(-4) : null;
  if (!last4) return;

  const { data: existing } = await service
    .from("payment_method_tokens")
    .select("id")
    .eq("billing_account_id", metadata.billing_account_id)
    .is("revoked_at", null)
    .eq("is_default", true)
    .maybeSingle();
  if (existing) return;

  await service.from("payment_method_tokens").insert({
    tenant_id: metadata.tenant_id,
    billing_account_id: metadata.billing_account_id,
    provider: providerSlug,
    provider_token: `mock_tok_${crypto.randomUUID()}`,
    card_brand: cardBrandFromNumber(normalized),
    last4,
    is_default: true,
  });
}

export type ConfirmMockPaymentResult =
  | { ok: true; paymentId: string; duplicate: boolean; alreadyPaid?: boolean }
  | { ok: false; code: "MOCK_PAYMENT_DECLINED"; message: string };

export async function confirmMockPayment(
  params: ConfirmMockPaymentParams,
): Promise<ConfirmMockPaymentResult> {
  if (params.scenario === "decline") {
    return {
      ok: false,
      code: MOCK_PAYMENT_DECLINED_CODE,
      message: "Mock payment declined",
    };
  }

  const providerSlug = params.providerSlug ?? "mock";
  const providerPaymentRef = params.providerPaymentRef ?? `mock_pi_${crypto.randomUUID()}`;
  if (params.mockCardNumber) {
    await saveMockCardToken(
      params.service,
      params.metadata,
      params.mockCardNumber,
      providerSlug,
    );
  }

  const { handlePaymentEventInternal } = await import("../handle-payment-event.ts");

  if (providerSlug === "icount") {
    const provider = new MockIcountPaymentProvider();
    const ipnBody = buildMockIpnFromCharge({
      providerPaymentRef,
      amountMinor: params.amountMinor,
      currency: params.currency,
      metadata: params.metadata,
    });
    const headers = new Headers({ "x-mock-signature": "mock-valid" });
    const event = await provider.constructEvent(
      ipnBody,
      headers,
      params.metadata.tenant_id,
    );
    const result = await handlePaymentEventInternal(params.service, event, "icount");
    return { ok: true, paymentId: result.paymentId, duplicate: result.duplicate };
  }

  const event = buildMockPaymentEvent({
    providerPaymentRef,
    amountMinor: params.amountMinor,
    currency: params.currency,
    metadata: params.metadata,
  });
  const result = await handlePaymentEventInternal(params.service, event, providerSlug);
  return { ok: true, paymentId: result.paymentId, duplicate: result.duplicate };
}

/** Apply mock sync path (renewals / tests). */
export async function applyMockSyncEvent(
  service: SupabaseClient,
  event: PaymentEvent,
  providerSlug = "mock",
): Promise<void> {
  const { handlePaymentEventInternal } = await import("../handle-payment-event.ts");
  await handlePaymentEventInternal(service, event, providerSlug);
}

export function buildChargeMetadata(input: {
  tenantId: string;
  engagementId: string;
  billingAccountId: string;
  offeringId: string;
  personId: string;
  vatRate: number;
  pretaxMinor: number;
  vatMinor: number;
  totalMinor: number;
  chargeType?: "initial" | "renewal";
  billingScheduleId?: string;
}): ChargeMetadata {
  return {
    tenant_id: input.tenantId,
    engagement_id: input.engagementId,
    billing_account_id: input.billingAccountId,
    charge_type: input.chargeType ?? "initial",
    billing_schedule_id: input.billingScheduleId,
    offering_id: input.offeringId,
    person_id: input.personId,
    vat_rate: "0",
    pretax_amount_minor: "0",
    vat_amount_minor: "0",
    total_amount_minor: String(input.totalMinor),
  };
}

export function scenarioFromMockCardNumber(cardNumber: string | undefined): MockPaymentScenario {
  const normalized = (cardNumber ?? "").replace(/\s/g, "");
  if (normalized === MOCK_DECLINE_CARD_SUFFIX) {
    return "decline";
  }
  return "success";
}
