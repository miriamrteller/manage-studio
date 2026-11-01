import { z } from "npm:zod@3.22.4";

/**
 * `none` = invoicing off: no tax document is ever enqueued or issued by the app. For
 * studios that are not a registered business yet, or that issue receipts themselves.
 */
export const INVOICING_PROVIDER_SLUGS = ["green_invoice", "mock", "grow", "icount", "invoice4u", "ypay", "tranzila", "yesh", "none"] as const;
export type InvoicingProviderSlug = (typeof INVOICING_PROVIDER_SLUGS)[number];

export const InvoicingProviderSlugSchema = z.enum(INVOICING_PROVIDER_SLUGS);

/** Invoicing switched off for the tenant: the app must not issue any tax document. */
export function isInvoicingOff(value: string | null | undefined): boolean {
  return value === "none";
}

export function parseInvoicingProviderSlug(
  value: string | null | undefined,
): InvoicingProviderSlug {
  return InvoicingProviderSlugSchema.parse(value ?? "grow");
}
