import { z } from "npm:zod@3.22.4";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { resolveCheckoutSession } from "../_shared/checkout-session.ts";
import {
  MOCK_PAYMENT_DECLINED_CODE,
  confirmMockPayment,
  scenarioFromMockCardNumber,
} from "../_shared/payments/providers/mock.ts";
import { resolveMockConfirmEligibility } from "../_shared/payments/mock-confirm-eligibility.ts";

const ConfirmMockPaymentBodySchema = z.object({
  offering_id: z.string().uuid(),
  engagement_id: z.string().uuid(),
  enrolment_token: z.string().optional(),
  scenario: z.enum(["success", "decline"]).optional(),
  mock_card_number: z.string().max(32).optional(),
  mock_payment_ref: z.string().max(128).optional(),
});

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: z.infer<typeof ConfirmMockPaymentBodySchema>;
  try {
    body = ConfirmMockPaymentBodySchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  try {
    const resolved = await resolveCheckoutSession(req, body);
    if (!resolved.ok) {
      return jsonResponse({ error: resolved.error }, resolved.status);
    }

    const { session } = resolved;
    const paymentProvider = session.tenant.payment_provider;
    const mockEligibility = resolveMockConfirmEligibility(paymentProvider);
    if (!mockEligibility.ok) {
      return jsonResponse({ error: "Tenant is not configured for mock payments" }, 409);
    }

    const { service } = session;

    const { data: existingPayment } = await service
      .from("payments")
      .select("id")
      .eq("engagement_id", session.engagement.id)
      .eq("status", "succeeded")
      .maybeSingle();

    if (existingPayment) {
      return jsonResponse({
        confirmed: true,
        alreadyPaid: true,
        paymentId: existingPayment.id,
      });
    }

    const scenario = body.scenario ?? scenarioFromMockCardNumber(body.mock_card_number);
    const result = await confirmMockPayment({
      service,
      metadata: session.metadata,
      amountMinor: session.totalMinor,
      currency: session.currency,
      scenario,
      providerPaymentRef: body.mock_payment_ref,
      providerSlug: mockEligibility.providerSlug,
      mockCardNumber: body.mock_card_number,
    });

    if (!result.ok) {
      return jsonResponse(
        { error: result.message, code: result.code },
        402,
      );
    }

    return jsonResponse({
      confirmed: true,
      paymentId: result.paymentId,
      duplicate: result.duplicate,
    });
  } catch (error) {
    console.error("[confirm-mock-payment]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});

export { MOCK_PAYMENT_DECLINED_CODE };
