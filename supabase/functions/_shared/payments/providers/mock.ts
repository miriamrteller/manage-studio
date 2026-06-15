import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { buildMockPaymentEvent } from "../handle-payment-event.ts";
import type { ChargeMetadata, ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";
import { ChargeMetadataSchema } from "../types.ts";

export class MockPaymentProvider implements PaymentProvider {
  readonly slug = "mock";

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    const providerPaymentRef = `mock_pi_${crypto.randomUUID()}`;
    const emitSyncEvent = buildMockPaymentEvent({
      providerPaymentRef,
      amountMinor: params.amountMinor,
      currency: params.currency,
      metadata: params.metadata,
    });
    return {
      clientSecret: providerPaymentRef,
      providerPaymentRef,
      emitSyncEvent,
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

/** Apply mock sync path immediately (CI/dev). */
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
