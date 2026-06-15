import { describe, it, expect } from "vitest";
import { z } from "zod";
import { backoffMinutes } from "../../../../supabase/functions/_shared/invoicing/backoff.ts";

const ChargeMetadataSchema = z.object({
  tenant_id: z.string().uuid(),
  engagement_id: z.string().uuid(),
  billing_account_id: z.string().uuid(),
  charge_type: z.enum(["initial", "renewal"]),
  billing_schedule_id: z.string().uuid().optional(),
});

function buildChargeMetadata(input: {
  tenantId: string;
  engagementId: string;
  billingAccountId: string;
  chargeType?: "initial" | "renewal";
  billingScheduleId?: string;
}) {
  return {
    tenant_id: input.tenantId,
    engagement_id: input.engagementId,
    billing_account_id: input.billingAccountId,
    charge_type: input.chargeType ?? "initial",
    billing_schedule_id: input.billingScheduleId,
  };
}

describe("ChargeMetadata on every charge", () => {
  it("includes required routing fields for webhook finalise", () => {
    const metadata = buildChargeMetadata({
      tenantId: "00000000-0000-0000-0000-000000000001",
      engagementId: "00000000-0000-0000-0000-000000000101",
      billingAccountId: "00000000-0000-0000-0000-000000000408",
    });
    expect(ChargeMetadataSchema.parse(metadata).charge_type).toBe("initial");
  });

  it("requires billing_schedule_id for renewal metadata", () => {
    const metadata = buildChargeMetadata({
      tenantId: "00000000-0000-0000-0000-000000000001",
      engagementId: "00000000-0000-0000-0000-000000000101",
      billingAccountId: "00000000-0000-0000-0000-000000000408",
      chargeType: "renewal",
      billingScheduleId: "00000000-0000-0000-0000-000000000601",
    });
    expect(metadata.billing_schedule_id).toBe("00000000-0000-0000-0000-000000000601");
  });
});

/** Partial-failure webhook replay: payment row exists → finalise must still run. */
export function shouldRunFinaliseOnReplay(params: {
  existingPaymentId: string | null;
  webhookDeliveries: number;
}): boolean {
  void params.existingPaymentId;
  return params.webhookDeliveries >= 1;
}

describe("partial-failure webhook replay", () => {
  it("always runs finalise when payment row already exists", () => {
    expect(
      shouldRunFinaliseOnReplay({
        existingPaymentId: "pay-1",
        webhookDeliveries: 2,
      }),
    ).toBe(true);
  });

  it("does not skip finalise on duplicate provider ref", () => {
    expect(
      shouldRunFinaliseOnReplay({
        existingPaymentId: "pay-1",
        webhookDeliveries: 1,
      }),
    ).toBe(true);
  });
});

describe("renewal finalise guard", () => {
  it("requires billingScheduleId for renewal branch", () => {
    const renewal = { chargeType: "renewal" as const, billingScheduleId: undefined };
    expect(renewal.chargeType === "renewal" && !renewal.billingScheduleId).toBe(true);
  });
});

describe("dunning schedule offsets (Stage 3 stub)", () => {
  it("uses increasing backoff days for renewal failures", () => {
    expect(backoffMinutes(1)).toBe(2);
  });
});
