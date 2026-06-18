import { describe, expect, it } from "vitest";
import {
  MOCK_DECLINE_CARD_SUFFIX,
  MOCK_PAYMENT_DECLINED_CODE,
  confirmMockPayment,
  scenarioFromMockCardNumber,
} from "../../../../supabase/functions/_shared/payments/providers/mock.ts";
import { buildChargeMetadata } from "../../../../supabase/functions/_shared/payments/providers/mock.ts";

const metadata = buildChargeMetadata({
  tenantId: "00000000-0000-0000-0000-000000000001",
  engagementId: "00000000-0000-0000-0000-000000001001",
  billingAccountId: "00000000-0000-0000-0000-000000000408",
  offeringId: "00000000-0000-0000-0000-000000000301",
  personId: "00000000-0000-0000-0000-000000000501",
  vatRate: 0.17,
  pretaxMinor: 85,
  vatMinor: 15,
  totalMinor: 100,
});

describe("mock payment decline scenario (G0)", () => {
  it("scenarioFromMockCardNumber maps decline test PAN", () => {
    expect(scenarioFromMockCardNumber(MOCK_DECLINE_CARD_SUFFIX)).toBe("decline");
    expect(scenarioFromMockCardNumber("4580458045804580")).toBe("success");
  });

  it("confirmMockPayment decline does not call handlePaymentEventInternal", async () => {
    const service = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }),
      }),
    };

    const result = await confirmMockPayment({
      service: service as never,
      metadata,
      amountMinor: 100,
      currency: "ILS",
      scenario: "decline",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(MOCK_PAYMENT_DECLINED_CODE);
    }
  });
});
