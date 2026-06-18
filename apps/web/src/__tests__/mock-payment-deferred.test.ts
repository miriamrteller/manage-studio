import { describe, expect, it } from "vitest";
import { MockPaymentProvider } from "../../../../supabase/functions/_shared/payments/providers/mock.ts";

describe("mock payment deferred checkout (G0)", () => {
  it("createCharge does not emit sync finalisation event", async () => {
    const provider = new MockPaymentProvider();
    const result = await provider.createCharge({
      amountMinor: 100,
      currency: "ILS",
      idempotencyKey: "test-key",
      metadata: {
        tenant_id: "00000000-0000-0000-0000-000000000001",
        engagement_id: "00000000-0000-0000-0000-000000001001",
        billing_account_id: "00000000-0000-0000-0000-000000000408",
        charge_type: "initial",
      },
    });

    expect(result.providerPaymentRef).toMatch(/^mock_pi_/);
    expect(result.clientSecret).toBe(result.providerPaymentRef);
    expect("emitSyncEvent" in result).toBe(false);
  });
});
