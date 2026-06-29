import {
  buildMockCcBillRequest,
  MOCK_ICOUNT_API_V3_BASE,
  parseMockCcBillResponse,
} from "../icount/mock-api.ts";
import { parseIcountIpn } from "../icount/ipn.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";

/**
 * Mock iCount payment adapter — CI/dev stand-in for the real CC page redirect flow.
 *
 * Returned only when `payment_provider='icount'` and `ICOUNT_MOCK=true`.
 */
export class MockIcountPaymentProvider implements PaymentProvider {
  readonly slug = "icount";

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    const providerPaymentRef = `mockicount_${crypto.randomUUID()}`;
    const amount = (params.amountMinor / 100).toFixed(2);

    const query = new URLSearchParams({
      cs: amount,
      cd: "OpalSwift enrolment",
      m__tenant_id: params.metadata.tenant_id,
      m__engagement_id: params.metadata.engagement_id,
    });

    return {
      providerPaymentRef,
      pageUrl: `https://mock.icount.local/pay/${providerPaymentRef}?${query.toString()}`,
      pendingWebhook: true,
    };
  }

  async chargeWithToken(params: ChargeParams): Promise<ChargeResult> {
    if (!params.savedToken) {
      throw new Error("Mock iCount cc/bill requires savedToken");
    }

    const requestFields = buildMockCcBillRequest(params);
    const responseJson = {
      status: true,
      confirmation_code: `mockicount_${crypto.randomUUID()}`,
      doctype: "invrec",
      docnum: 3010,
      sum: requestFields.sum,
      currency_code: requestFields.currency_code,
    };

    const parsed = parseMockCcBillResponse(responseJson);
    void MOCK_ICOUNT_API_V3_BASE;

    return {
      providerPaymentRef: parsed.confirmationCode,
      pendingWebhook: true,
    };
  }

  async constructEvent(rawBody: string, headers: Headers, _tenantId: string): Promise<PaymentEvent> {
    const sig = headers.get("x-mock-signature");
    if (sig !== "mock-valid") {
      throw new Error("Invalid mock iCount signature");
    }
    return parseIcountIpn(rawBody);
  }

  async refundCharge(params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }> {
    const sum = (params.amountMinor / 100).toFixed(2);
    void sum;
    return {
      providerRefundRef: `mockicount_refund_${params.providerPaymentRef}_${params.amountMinor}`,
    };
  }

  async verifyCredentials(_tenantId: string): Promise<{ valid: boolean; message: string }> {
    return { valid: true, message: "Mock iCount credentials accepted (ICOUNT_MOCK)." };
  }
}
