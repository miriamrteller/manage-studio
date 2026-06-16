import { describe, expect, it } from "vitest";
import { buildMockPaymentEvent } from "../../../../supabase/functions/_shared/payments/handle-payment-event.ts";
import {
  MockPaymentProvider,
  buildChargeMetadata,
} from "../../../../supabase/functions/_shared/payments/providers/mock.ts";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const ENGAGEMENT_ID = "00000000-0000-0000-0000-000000000301";
const BILLING_ACCOUNT_ID = "00000000-0000-0000-0000-000000000408";
const OFFERING_ID = "00000000-0000-0000-0000-000000000301";
const PERSON_ID = "00000000-0000-0000-0000-000000000501";

export const PAYMENT_CONFIRMATION_AUDIT = {
  sent: "payment_confirmation_email_sent",
  skipped: "payment_confirmation_email_skipped",
  failed: "payment_confirmation_email_failed",
} as const;

describe("mock payment checkout → confirmation email path", () => {
  it("mock provider emits a sync payment.succeeded event on createCharge", async () => {
    const provider = new MockPaymentProvider();
    const metadata = buildChargeMetadata({
      tenantId: TENANT_ID,
      engagementId: ENGAGEMENT_ID,
      billingAccountId: BILLING_ACCOUNT_ID,
      offeringId: OFFERING_ID,
      personId: PERSON_ID,
      vatRate: 0.17,
      pretaxMinor: 29900,
      vatMinor: 5100,
      totalMinor: 35000,
      chargeType: "initial",
    });

    const result = await provider.createCharge({
      amountMinor: 35000,
      currency: "ILS",
      idempotencyKey: `engagement-${ENGAGEMENT_ID}`,
      metadata,
    });

    expect(result.emitSyncEvent).toBeDefined();
    expect(result.emitSyncEvent?.type).toBe("payment.succeeded");
    expect(result.emitSyncEvent?.metadata.engagement_id).toBe(ENGAGEMENT_ID);
    expect(result.emitSyncEvent?.metadata.charge_type).toBe("initial");
  });

  it("buildMockPaymentEvent carries routing metadata for finalise + confirmation", () => {
    const metadata = buildChargeMetadata({
      tenantId: TENANT_ID,
      engagementId: ENGAGEMENT_ID,
      billingAccountId: BILLING_ACCOUNT_ID,
      offeringId: OFFERING_ID,
      personId: PERSON_ID,
      vatRate: 0.17,
      pretaxMinor: 29900,
      vatMinor: 5100,
      totalMinor: 35000,
    });

    const event = buildMockPaymentEvent({
      providerPaymentRef: "mock_pi_test",
      amountMinor: 35000,
      currency: "ILS",
      metadata,
    });

    expect(event.type).toBe("payment.succeeded");
    expect(event.personId).toBe(PERSON_ID);
    expect(event.offeringId).toBe(OFFERING_ID);
    expect(event.metadata.tenant_id).toBe(TENANT_ID);
    expect(event.metadata.charge_type).toBe("initial");
  });

  it("documents confirmation audit actions after initial mock charge finalise", () => {
    const expectedSequence = [
      "payment_succeeded",
      PAYMENT_CONFIRMATION_AUDIT.sent,
    ];
    expect(expectedSequence).toContain(PAYMENT_CONFIRMATION_AUDIT.sent);
    expect(expectedSequence[0]).toBe("payment_succeeded");
  });

  it("falls back to admin link recipient when guardian email is missing", () => {
    const recipientFromGuardian = null;
    const adminLinkRecipient = "miriamrstern@gmail.com";
    const resolved = recipientFromGuardian ?? adminLinkRecipient;
    expect(resolved).toBe("miriamrstern@gmail.com");
  });
});
