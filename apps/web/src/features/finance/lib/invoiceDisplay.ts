/**
 * Invoice display helpers for Grow-settled payments.
 *
 * Grow issues the VAT document internally (including any allocation number).
 * OpalSwift receives the document reference (documentNumber, documentUrl) from
 * Grow's invoice webhook — never the VAT breakdown or allocation number.
 *
 * These helpers work with fields actually stored in the payments table.
 */

/** Fields available after Grow's invoice webhook has been applied to a payment row. */
export interface GrowSettledCharge {
  /** Grow invoice / asmachta number, e.g. "INV-2024-001". Null if not yet received. */
  externalDocumentNumber: string | null;
  /** Grow-hosted PDF URL (convenience; may expire — prefer document_pdf_path for legal copy). */
  documentUrl: string | null;
  /** Total charge amount in minor units (agorot). */
  amountMinor: number;
  /** Payment row status. */
  status: 'succeeded' | 'failed';
}

/**
 * Builds display lines for a Grow payment document reference.
 * Returns only fields OpalSwift actually stores from Grow's invoice webhook.
 * Never renders "null" as a string on a display surface.
 */
export function buildInvoiceDisplayLines(charge: GrowSettledCharge): string[] {
  const lines: string[] = [
    `סכום: ${(charge.amountMinor / 100).toFixed(2)} ₪`,
  ];
  if (charge.externalDocumentNumber != null) {
    lines.push(`מספר חשבונית: ${charge.externalDocumentNumber}`);
  }
  if (charge.documentUrl != null) {
    lines.push(`קישור להורדה: ${charge.documentUrl}`);
  }
  return lines;
}

/**
 * Returns a human-readable settlement status label in Hebrew.
 */
export function getSettlementStatusLabel(
  charge: Pick<GrowSettledCharge, 'status'>,
): string {
  switch (charge.status) {
    case 'succeeded':
      return 'שולם';
    case 'failed':
      return 'נכשל';
    default: {
      const _exhaustive: never = charge.status;
      return String(_exhaustive);
    }
  }
}
