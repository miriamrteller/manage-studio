import { z } from "npm:zod@3.22.4";

export const INVOICING_PROVIDER_SLUGS = ["green_invoice", "mock", "grow", "icount"] as const;
export type InvoicingProviderSlug = (typeof INVOICING_PROVIDER_SLUGS)[number];

export const InvoicingProviderSlugSchema = z.enum(INVOICING_PROVIDER_SLUGS);

export function parseInvoicingProviderSlug(
  value: string | null | undefined,
): InvoicingProviderSlug {
  return InvoicingProviderSlugSchema.parse(value ?? "green_invoice");
}
