import { z } from "npm:zod@3.22.4";

/** `none`: the studio issues no tax documents (e.g. not a registered business yet). */
export const INVOICING_PROVIDER_SLUGS = ["green_invoice", "mock", "grow", "icount", "invoice4u", "ypay", "tranzila", "yesh", "takbull", "none"] as const;
export type InvoicingProviderSlug = (typeof INVOICING_PROVIDER_SLUGS)[number];

export const InvoicingProviderSlugSchema = z.enum(INVOICING_PROVIDER_SLUGS);

export function parseInvoicingProviderSlug(
  value: string | null | undefined,
): InvoicingProviderSlug {
  return InvoicingProviderSlugSchema.parse(value ?? "grow");
}
