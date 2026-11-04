/**
 * What each provider OpalSwift offers can't do, in short plain lines (owner decision
 * 2026-11-04): shown under each option in the setup wizard and in Settings, so a studio picks
 * knowing the gaps. Only what was verified against the provider's docs or our own code is
 * stated as fact; anything else reads "check with <provider>".
 *
 * Each entry is a list of i18n keys under provider_limits.<kind>.<slug>.
 */
export type ProviderLimitKind = 'payment' | 'invoicing';

const PAYMENT_LIMITS: Record<string, readonly string[]> = {
  // Grow: card charges, saved cards and refunds work; documents come only with its own charges.
  grow: ['recorded_receipts'],
  // YPay API v2.1: a hosted payment page only (no token field), no refund call.
  ypay: ['no_saved_cards', 'refunds_in_provider'],
  // Our Invoice4U adapter: no renewals (ChargeWithToken) and no refunds yet.
  invoice4u: ['no_monthly_yet', 'refunds_in_provider', 'recorded_receipts'],
  offline: ['no_cards'],
};

const INVOICING_LIMITS: Record<string, readonly string[]> = {
  grow: ['own_charges_only', 'refunds_in_provider', 'branding_check'],
  // Our Invoice4U adapter issues documents only with Invoice4U's own charges.
  invoice4u: ['own_charges_only', 'refunds_in_provider', 'branding_check'],
  // YPay API v2.1: no field links a receipt to an earlier invoice; refund documents not built.
  ypay: ['ypay_payments_only', 'no_linked_deposits', 'refunds_in_provider', 'branding_check'],
  green_invoice: ['documents_only', 'receipt_refunds', 'branding_check'],
};

/** Pure: the i18n keys for what this provider can't do (empty when nothing to say). */
export function providerLimitKeys(kind: ProviderLimitKind, slug: string | null | undefined): string[] {
  const table = kind === 'payment' ? PAYMENT_LIMITS : INVOICING_LIMITS;
  return (table[slug ?? ''] ?? []).map((line) => `provider_limits.${kind}.${slug}.${line}`);
}
