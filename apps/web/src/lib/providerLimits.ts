/**
 * What OpalSwift can't do with each provider it offers, in short plain lines (owner decision
 * 2026-11-04), shown under each option in the setup wizard and in Settings.
 *
 * Owner rule: confirmed facts only. Each line states what OpalSwift itself does today (from our
 * own code), never a claim about what the provider can or can't do. Anything not confirmed is
 * left out, not hedged.
 *
 * Each entry is a list of i18n keys under provider_limits.<kind>.<slug>.
 */
export type ProviderLimitKind = 'payment' | 'invoicing';

const PAYMENT_LIMITS: Record<string, readonly string[]> = {
  // Grow documents come only with Grow's own charges (enqueue-document BUNDLED_ONLY_INVOICING).
  grow: ['recorded_receipts'],
  // payments/providers/ypay.ts: chargeWithToken and refundCharge throw.
  ypay: ['no_monthly', 'no_refunds'],
  // payments/providers/invoice4u.ts: renewals (ChargeWithToken) not implemented; documents only
  // with its own charges.
  invoice4u: ['no_monthly', 'recorded_receipts'],
  offline: ['no_cards'],
};

const INVOICING_LIMITS: Record<string, readonly string[]> = {
  grow: ['own_charges_only', 'no_refund_documents'],
  invoice4u: ['own_charges_only', 'no_refund_documents'],
  // Pairing (lib/providerPairing.ts); invoicing/providers/ypay.ts refuses refund documents.
  ypay: ['ypay_payments_only', 'no_refund_documents'],
  // enqueue-document: refunds for receipt (400) studios are not issued.
  green_invoice: ['documents_only', 'receipt_refunds'],
};

/** Pure: the i18n keys for what OpalSwift can't do with this provider (empty when nothing). */
export function providerLimitKeys(kind: ProviderLimitKind, slug: string | null | undefined): string[] {
  const table = kind === 'payment' ? PAYMENT_LIMITS : INVOICING_LIMITS;
  return (table[slug ?? ''] ?? []).map((line) => `provider_limits.${kind}.${slug}.${line}`);
}
