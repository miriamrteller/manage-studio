/**
 * Ways a studio is paid directly, recorded with "Record a payment" alongside its card provider.
 * Bit / PayBox is one option with one label (`payment_methods.bit`).
 */
export const MANUAL_PAYMENT_METHODS = ['cash', 'bank_transfer', 'bit'] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export function isManualPaymentMethod(value: string | null | undefined): value is ManualPaymentMethod {
  return (MANUAL_PAYMENT_METHODS as readonly string[]).includes(value ?? '');
}

/**
 * Invoicing services that issue documents only with their own card charges (as
 * supabase/functions/_shared/enqueue-document.ts BUNDLED_ONLY_INVOICING): a payment recorded in
 * OpalSwift gets no receipt from them.
 */
export const RECEIPT_WITH_OWN_CHARGES_ONLY = ['grow', 'icount', 'invoice4u'] as const;

/** Unfinished invoicing services: no documents from OpalSwift yet (enqueue-document.ts NO_DOCUMENTS_YET_INVOICING). */
export const NO_DOCUMENTS_YET = ['tranzila', 'yesh'] as const;

export function invoicingReceiptsRecordedPayments(invoicingProvider: string | null | undefined): boolean {
  const slug = invoicingProvider ?? '';
  return (
    !(RECEIPT_WITH_OWN_CHARGES_ONLY as readonly string[]).includes(slug) &&
    !(NO_DOCUMENTS_YET as readonly string[]).includes(slug)
  );
}

/**
 * Pure (owner decision 2026-11-04): Bit / PayBox is offered where the studio's invoicing can
 * issue its receipt (or the studio issues no documents). Where it can't (Grow, iCount,
 * Invoice4U) it is hidden unless the studio switched it on in Settings, issuing the receipt
 * itself. Cash and bank transfer are always offered.
 */
export function manualPaymentMethodsFor(input: {
  invoicingProvider: string | null | undefined;
  acceptUnreceiptedBit: boolean;
}): ManualPaymentMethod[] {
  const bit = invoicingReceiptsRecordedPayments(input.invoicingProvider) || input.acceptUnreceiptedBit;
  return MANUAL_PAYMENT_METHODS.filter((m) => m !== 'bit' || bit);
}
