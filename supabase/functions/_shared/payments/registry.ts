import { z } from "npm:zod@3.22.4";

/** `stripe` remains parseable (adapter code dormant) but is not offered in product UI. */
export const PAYMENT_PROVIDER_SLUGS = ["stripe", "mock", "grow", "icount", "invoice4u"] as const;
export type PaymentProviderSlug = (typeof PAYMENT_PROVIDER_SLUGS)[number];

export const PaymentProviderSlugSchema = z.enum(PAYMENT_PROVIDER_SLUGS);

export function parsePaymentProviderSlug(
  value: string | null | undefined,
): PaymentProviderSlug {
  return PaymentProviderSlugSchema.parse(value ?? "grow");
}
