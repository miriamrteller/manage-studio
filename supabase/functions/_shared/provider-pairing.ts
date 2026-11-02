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

/**
 * Payment providers that are not finished (payments audit P2 #9, #10): Tranzila reads every
 * success as a failure, and iCount cannot confirm a payment outside mock mode. Not offered to
 * new studios or as a new choice; a studio that already uses one keeps it.
 */
export const UNFINISHED_PAYMENT_PROVIDERS = ["icount", "tranzila"] as const;

export function isUnfinishedPaymentProvider(slug: string | null | undefined): boolean {
  return (UNFINISHED_PAYMENT_PROVIDERS as readonly string[]).includes(slug ?? "");
}

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

/**
 * Payment providers whose callback settles a photographer's job payment request (deposit /
 * balance link): YPay, and Grow since the notice handler settles job requests (payments audit
 * P2 #11). Others take the money but never mark the request paid, so they are not offered.
 * `mock` is the dev/CI stand-in.
 */
export const JOB_ONLINE_PAYMENT_PROVIDERS = ["ypay", "grow", "mock"] as const;

export function jobOnlinePaymentSupported(paymentProvider: string | null | undefined): boolean {
  return (JOB_ONLINE_PAYMENT_PROVIDERS as readonly string[]).includes(paymentProvider ?? "");
}
