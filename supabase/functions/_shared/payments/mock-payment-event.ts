import type { PaymentEvent } from "./types.ts";

interface ChargeParamsLike {
  providerPaymentRef: string;
  amountMinor: number;
  currency: string;
  metadata: PaymentEvent["metadata"];
}

/** Standalone mock event builder — keep out of handle-payment-event.ts to avoid pulling email deps into lightweight edge functions. */
export function buildMockPaymentEvent(params: ChargeParamsLike): PaymentEvent {
  return {
    type: "payment.succeeded",
    providerPaymentRef: params.providerPaymentRef,
    metadata: params.metadata,
    amountMinor: params.amountMinor,
    currency: params.currency,
    pretaxAmountMinor: 0,
    vatAmountMinor: 0,
    vatRate: 0,
    offeringId: params.metadata.offering_id,
    personId: params.metadata.person_id,
  };
}
