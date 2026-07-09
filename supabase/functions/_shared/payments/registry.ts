import { z } from "npm:zod@3.22.4";

export const PAYMENT_PROVIDER_SLUGS = ["stripe", "mock", "grow", "icount", "rapyd", "icount_paypage"] as const;
export type PaymentProviderSlug = (typeof PAYMENT_PROVIDER_SLUGS)[number];

export const INVOICING_PROVIDER_SLUGS = ["yesh", "icount", "grow", "green_invoice"] as const;
export type InvoicingProviderSlug = (typeof INVOICING_PROVIDER_SLUGS)[number];

export const PaymentProviderSlugSchema = z.enum(PAYMENT_PROVIDER_SLUGS);
export const InvoicingProviderSlugSchema = z.enum(INVOICING_PROVIDER_SLUGS);

export function parsePaymentProviderSlug(
  value: string | null | undefined,
): PaymentProviderSlug {
  return PaymentProviderSlugSchema.parse(value ?? "stripe");
}

export function parseInvoicingProviderSlug(
  value: string | null | undefined,
): InvoicingProviderSlug {
  return InvoicingProviderSlugSchema.parse(value ?? "green_invoice");
}
