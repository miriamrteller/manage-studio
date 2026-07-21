import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";

/**
 * Invoice4U payment adapter — stub until U2b (live HTTP client).
 *
 * Returned when `payment_provider='invoice4u'` and `INVOICE4U_MOCK` is not true.
 * Hosted checkout + callback parsing land in U2; live ProcessApiRequestV2 in U2b.
 */
export class Invoice4uPaymentProvider implements PaymentProvider {
  readonly slug = "invoice4u";

  constructor(private readonly service: SupabaseClient) {
    void this.service;
  }

  async createCharge(_params: ChargeParams): Promise<ChargeResult> {
    throw new Error("Invoice4U createCharge not implemented — U2b");
  }

  async chargeWithToken(_params: ChargeParams): Promise<ChargeResult> {
    throw new Error("Invoice4U chargeWithToken not implemented — U2b");
  }

  async constructEvent(
    _rawBody: string,
    _headers: Headers,
    _tenantId: string,
  ): Promise<PaymentEvent> {
    throw new Error("Invoice4U constructEvent not implemented — U2b");
  }

  async refundCharge(_params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }> {
    throw new Error("Invoice4U refundCharge not implemented — U2b");
  }

  async verifyCredentials(_tenantId: string): Promise<{ valid: boolean; message: string }> {
    throw new Error("Invoice4U verifyCredentials not implemented — U2b");
  }
}
