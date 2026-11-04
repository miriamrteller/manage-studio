import type { IssuedDocumentKind, PaymentLogRow } from '@shared/schemas';

/**
 * Per-payment tax document facts for the payments log and the accountant export.
 *
 * Owner rule: VAT is shown from the document actually issued, never from business
 * status. A studio that changes status mid-year needs nothing special: each payment
 * follows its own document.
 */

/** Why a payment has no tax document. */
export type NoDocumentReason =
  /** Not paid (pending / failed): nothing to document. */
  | 'not_paid'
  /** Queued, the invoicing service hasn't answered yet. */
  | 'pending'
  /** The invoicing service refused or gave up; an admin was alerted. */
  | 'failed'
  /** The studio's invoicing service can't issue a standalone document for this money. */
  | 'not_issued'
  /** The studio doesn't issue documents through OpalSwift (invoicing: none). */
  | 'no_invoicing'
  /** YPay has no credit-document API: the refund document is made in YPay itself. */
  | 'refund_in_provider'
  /** Paid, but no document and no queue row yet (the missing-documents check follows up). */
  | 'missing';

export type PaymentDocumentStatus =
  | {
      issued: true;
      /** Null when the provider issued it without telling us the type. */
      kind: IssuedDocumentKind | null;
      number: string | null;
      url: string | null;
    }
  | { issued: false; reason: NoDocumentReason };

type DocumentRow = Pick<
  PaymentLogRow,
  | 'status'
  | 'charge_type'
  | 'provider'
  | 'external_document_id'
  | 'external_document_number'
  | 'invoice_url'
  | 'issued_document_kind'
  | 'document_queue'
>;

export function paymentDocumentStatus(
  row: DocumentRow,
  tenant: { invoicing_provider?: string | null } | null | undefined,
): PaymentDocumentStatus {
  if (row.external_document_id || row.external_document_number) {
    return {
      issued: true,
      kind: row.issued_document_kind ?? null,
      number: row.external_document_number ?? null,
      url: row.invoice_url ?? null,
    };
  }

  if (row.status === 'pending' || row.status === 'failed') {
    return { issued: false, reason: 'not_paid' };
  }

  const latest = [...(row.document_queue ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )[0];
  if (latest) {
    if (latest.status === 'pending' || latest.status === 'processing') return { issued: false, reason: 'pending' };
    if (latest.status === 'dead') return { issued: false, reason: 'failed' };
    if (latest.status === 'not_issued') return { issued: false, reason: 'not_issued' };
  }

  if (!tenant?.invoicing_provider || tenant.invoicing_provider === 'none') {
    return { issued: false, reason: 'no_invoicing' };
  }
  if (row.charge_type === 'refund' && row.provider === 'ypay') {
    return { issued: false, reason: 'refund_in_provider' };
  }
  return { issued: false, reason: 'missing' };
}

/**
 * Israeli VAT rate on a date (YYYY-MM-DD or ISO timestamp).
 * [[ACCOUNTANT: confirm]] 17% until 31.12.2024, 18% from 1.1.2025.
 */
export function israelVatRateOn(date: string | null | undefined): number {
  const day = (date ?? '').slice(0, 10);
  if (day && day < '2025-01-01') return 0.17;
  return 0.18;
}

export interface VatSplit {
  /** Null when the document type is unknown: the provider's document has the split. */
  pretaxMinor: number | null;
  vatMinor: number | null;
  totalMinor: number;
  /** VAT rate used, or null when not split. */
  vatRate: number | null;
}

/**
 * Split a gross amount by the document issued:
 * - tax invoice-receipt / credit note: VAT included in the gross at the rate on the payment date;
 * - receipt: no VAT (pretax = total);
 * - unknown / no document: gross only.
 *
 * The provider's own document is the legal record; its rounding can differ by one agora.
 * [[ACCOUNTANT: confirm]] that a credit note carries VAT at the original rate.
 */
export function vatSplitFromDocument(
  totalMinor: number,
  kind: IssuedDocumentKind | null | undefined,
  date: string | null | undefined,
): VatSplit {
  if (kind === 'receipt') {
    return { pretaxMinor: totalMinor, vatMinor: 0, totalMinor, vatRate: 0 };
  }
  if (kind === 'tax_invoice_receipt' || kind === 'credit_note') {
    const rate = israelVatRateOn(date);
    const pretax = Math.round(totalMinor / (1 + rate));
    return { pretaxMinor: pretax, vatMinor: totalMinor - pretax, totalMinor, vatRate: rate };
  }
  return { pretaxMinor: null, vatMinor: null, totalMinor, vatRate: null };
}
