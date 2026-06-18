import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { buildMockPaymentEvent } from "../handle-payment-event.ts";
import type { ChargeMetadata, ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";
import { ChargeMetadataSchema } from "../types.ts";

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

  const providerPaymentRef = params.providerPaymentRef ?? `mock_pi_${crypto.randomUUID()}`;
  const event = buildMockPaymentEvent({
    providerPaymentRef,
    amountMinor: params.amountMinor,
    currency: params.currency,
    metadata: params.metadata,
  });

  const { handlePaymentEventInternal } = await import("../handle-payment-event.ts");
  const result = await handlePaymentEventInternal(params.service, event, "mock");
  return { ok: true, paymentId: result.paymentId, duplicate: result.duplicate };
}

/** Apply mock sync path (renewals / tests). */
export async function applyMockSyncEvent(
  service: SupabaseClient,
  event: PaymentEvent,
): Promise<void> {
  const { handlePaymentEventInternal } = await import("../handle-payment-event.ts");
  await handlePaymentEventInternal(service, event, "mock");
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
    vat_rate: String(input.vatRate),
    pretax_amount_minor: String(input.pretaxMinor),
    vat_amount_minor: String(input.vatMinor),
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
