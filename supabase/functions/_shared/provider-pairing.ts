/**
 * Which invoicing (tax document) services can work with which payment providers
 * (payments audit P1 #5). Pure, no imports; mirrored in apps/web/src/lib/providerPairing.ts
 * (a test checks the two agree).
 *
 *  - grow / icount / invoice4u issue the document together with their OWN card charge and
 *    have no standalone document API, so they only pair with the same payment provider.
 *  - ypay issues the document with its own card charge, and standalone documents for cash /
 *    bank transfer, but refuses other providers' card payments: ypay or offline payments.
 *  - green_invoice issues standalone documents for any payment.
 *  - none: no documents through OpalSwift; pairs with anything.
 *  - yesh and tranzila invoicing are not built yet, so they are never offered.
 */
export const PAIRABLE_INVOICING_PROVIDERS = [
  "grow",
  "icount",
  "invoice4u",
  "ypay",
  "green_invoice",
  "none",
] as const;

/** Invoicing services that exist in the data model but are not finished: never offered. */
export const UNFINISHED_INVOICING_PROVIDERS = ["yesh", "tranzila"] as const;

const BUNDLED_ONLY = new Set(["grow", "icount", "invoice4u"]);

export function invoicingPairsWithPayment(paymentProvider: string, invoicingProvider: string): boolean {
  if ((UNFINISHED_INVOICING_PROVIDERS as readonly string[]).includes(invoicingProvider)) return false;
  if (invoicingProvider === "none" || invoicingProvider === "green_invoice") return true;
  if (BUNDLED_ONLY.has(invoicingProvider)) return invoicingProvider === paymentProvider;
  if (invoicingProvider === "ypay") return paymentProvider === "ypay" || paymentProvider === "offline";
  return false;
}

/** The invoicing services that may be chosen with this payment provider, in display order. */
export function invoicingOptionsFor(paymentProvider: string): string[] {
  return PAIRABLE_INVOICING_PROVIDERS.filter((slug) => invoicingPairsWithPayment(paymentProvider, slug));
}
