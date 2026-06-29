import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getPaymentProvider } from "./index.ts";

export type RefundablePaymentRow = {
  provider: string;
  provider_payment_ref: string | null;
};

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
    return;
  }

  await provider.refundCharge({
    providerPaymentRef: payment.provider_payment_ref,
    amountMinor,
  });
}
