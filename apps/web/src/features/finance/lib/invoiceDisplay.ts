/**
 * Invoice display helpers — null-safe accessors for provider-authoritative fields.
 *
 * CNB-001: allocationNumber is nullable. Null is legally valid for sub-threshold
 * and osek-patur invoices (Tax Authority Regulation 6770 §2, Circular 1/2023).
 *
 * RULE: Never render "null" string on the face of a tax document.
 *       Omit the allocationNumber line entirely when the value is null.
 */
import type { ProviderVatResponse } from '@shared/vat/provider-adapter';

/**
 * Returns the allocation number string when present, or null.
 * Use this to conditionally render the מספר הקצאה field in UI and PDF.
 *
 * CNB-001 null-guard: safe to call with null — never throws.
 */
export function getAllocationNumber(
  charge: Pick<ProviderVatResponse, 'allocationNumber'>,
): string | null {
  // Explicit null-coalesce: satisfies the null-guard requirement even if
  // the field arrives as undefined from a partial DB read.
  return charge.allocationNumber ?? null;
}

/**
 * Builds display lines for a Hebrew tax invoice.
 *
 * CNB-001 null-guard: the מספר הקצאה line is conditionally included.
 * When allocationNumber is null, the line is omitted — never prints "null"
 * on the face of the document (RF-02 from the VAT plan).
 *
 * @returns Array of display strings, RTL-safe, ready for PDF or screen render.
 */
export function buildInvoiceDisplayLines(charge: ProviderVatResponse): string[] {
  const lines: string[] = [
    `חשבונית מס: ${charge.serialNumber}`,
    `סכום לפני מע"מ: ${charge.pretax}`,
    `מע"מ: ${charge.vat}`,
    `סה"כ: ${charge.total}`,
  ];

  // CNB-001 null-guard: conditionally render — never render null as a string.
  if (charge.allocationNumber != null) {
    lines.push(`מספר הקצאה: ${charge.allocationNumber}`);
  }

  return lines;
}

/**
 * Whether this charge is awaiting a Tax Authority allocation number.
 * Invoices with status 'pending_allocation' are legally issued but incomplete
 * for B2B invoices above threshold. They must not be presented to the buyer
 * until resolved (7-day SLA per Tax Authority rules).
 */
export function isPendingAllocation(charge: ProviderVatResponse): boolean {
  return charge.status === 'pending_allocation';
}

/**
 * Returns a human-readable settlement status label in Hebrew.
 * Safe to call with any status value including null allocationNumber.
 */
export function getSettlementStatusLabel(charge: ProviderVatResponse): string {
  switch (charge.status) {
    case 'settled':
      return 'שולם';
    case 'pending_allocation':
      return 'ממתין למספר הקצאה';
    case 'failed':
      return 'נכשל';
    default: {
      const _exhaustive: never = charge.status;
      return String(_exhaustive);
    }
  }
}
