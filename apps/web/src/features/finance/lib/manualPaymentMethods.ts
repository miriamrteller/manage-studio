/**
 * Ways a studio is paid directly, recorded with "Record a payment" alongside its card provider.
 * Bit's label is one i18n string (`payment_methods.bit`), so adding PayBox is a wording change.
 */
export const MANUAL_PAYMENT_METHODS = ['cash', 'bank_transfer', 'bit'] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export function isManualPaymentMethod(value: string | null | undefined): value is ManualPaymentMethod {
  return (MANUAL_PAYMENT_METHODS as readonly string[]).includes(value ?? '');
}
