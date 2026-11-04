import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { getPaymentProvider } from "./index.ts";
import { ManualRefundRequiredError } from "./refund-errors.ts";

export { ManualRefundRequiredError } from "./refund-errors.ts";

export type RefundablePaymentRow = {
  provider: string;
  provider_payment_ref: string | null;
};

/** Providers whose refund call issues the credit document itself (Takbull: Refund types 2 / 4). */
export const REFUND_DOCUMENT_WITH_REFUND_PROVIDERS = ["takbull"] as const;

/** Pure: true when the provider already issued the refund's document, so nothing is queued. */
export function refundDocumentIssuedWithRefund(input: { provider: string; manual: boolean }): boolean {
  return !input.manual && (REFUND_DOCUMENT_WITH_REFUND_PROVIDERS as readonly string[]).includes(input.provider);
}

/** Dispatch refund to the adapter for the payment row's provider slug (not tenant's current slug). */
export async function executeProviderRefund(
  service: SupabaseClient,
  payment: RefundablePaymentRow,
  amountMinor: number,
): Promise<void> {
  if (payment.provider === "manual" || !payment.provider_payment_ref) {
    return;
  }

  const provider = getPaymentProvider(service, payment.provider);
  if (!provider.refundCharge) {
    // No refund API: never record a refund as done when no money moved.
    throw new ManualRefundRequiredError(payment.provider);
  }

  await provider.refundCharge({
    providerPaymentRef: payment.provider_payment_ref,
    amountMinor,
  });
}
