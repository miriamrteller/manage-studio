import { z } from "npm:zod@4.6.7";

/**
 * `stripe` remains parseable (adapter code dormant) but is not offered in product UI.
 * `offline`: the studio takes no online payments. Parents finish enrolment and pay at
 * the studio; an admin records the payment (record-payment). No adapter exists for it.
 */
export const PAYMENT_PROVIDER_SLUGS = ["stripe", "mock", "grow", "icount", "invoice4u", "ypay", "tranzila", "takbull", "offline"] as const;
export type PaymentProviderSlug = (typeof PAYMENT_PROVIDER_SLUGS)[number];

export const PaymentProviderSlugSchema = z.enum(PAYMENT_PROVIDER_SLUGS);

export function parsePaymentProviderSlug(
  value: string | null | undefined,
): PaymentProviderSlug {
  return PaymentProviderSlugSchema.parse(value ?? "grow");
}
