import { describe, expect, it } from "vitest";
import {
  parsePrepareEnrolmentCheckoutBody,
  resolveBootstrapBlockReason,
} from "../../../../supabase/functions/_shared/checkout-bootstrap-parse.ts";

const ENGAGEMENT_ID = "00000000-0000-0000-0000-000000000301";
const PERSON_ID = "00000000-0000-0000-0000-000000000101";
const OFFERING_ID = "00000000-0000-0000-0000-000000000201";
const SEASON_ID = "00000000-0000-0000-0000-000000000401";

describe("prepare-enrolment-checkout contract", () => {
  it("documents response fields consumed by the web app", () => {
    const sample = {
      context: {
        engagementId: ENGAGEMENT_ID,
        offeringId: OFFERING_ID,
        status: "pending_payment",
        waiverRequired: false,
        waiverAlreadySigned: false,
        amountMinor: 100,
        currency: "ILS",
      },
      charge: {
        mockPending: true,
        paymentProvider: "mock",
        amountMinor: 100,
        currency: "ILS",
      },
    };
    expect(sample.context.engagementId).toBeTruthy();
    expect(sample.charge?.mockPending).toBe(true);
  });
});

describe("prepare-enrolment-checkout parsing (integration contract)", () => {
  it("accepts token pay link load payload", () => {
    const parsed = parsePrepareEnrolmentCheckoutBody({
      phase: "load",
      mode: "existing_engagement",
      engagement_id: ENGAGEMENT_ID,
    });
    expect(parsed.ok).toBe(true);
  });

  it("accepts token pay link pay payload without offering_id", () => {
    const parsed = parsePrepareEnrolmentCheckoutBody({
      phase: "pay",
      mode: "existing_engagement",
      engagement_id: ENGAGEMENT_ID,
      enrolment_token: "token",
    });
    expect(parsed.ok).toBe(true);
  });

  it("accepts token pay link pay payload with offering_id", () => {
    const parsed = parsePrepareEnrolmentCheckoutBody({
      phase: "pay",
      mode: "existing_engagement",
      engagement_id: ENGAGEMENT_ID,
      offering_id: OFFERING_ID,
      enrolment_token: "token",
    });
    expect(parsed.ok).toBe(true);
  });

  it("accepts stepper create_engagement payload", () => {
    const parsed = parsePrepareEnrolmentCheckoutBody({
      phase: "pay",
      mode: "create_engagement",
      person_id: PERSON_ID,
      offering_id: OFFERING_ID,
      season_id: SEASON_ID,
      waiver_evidence_id: "00000000-0000-0000-0000-000000000501",
    });
    expect(parsed.ok).toBe(true);
  });
});

describe("prepare-enrolment-checkout block reasons", () => {
  it("blocks pay when waiver unsigned", () => {
    expect(resolveBootstrapBlockReason("pending_payment", true)).toBe("waiver_required");
  });

  it("allows pay when waiver satisfied", () => {
    expect(resolveBootstrapBlockReason("pending_payment", false)).toBeUndefined();
  });
});
