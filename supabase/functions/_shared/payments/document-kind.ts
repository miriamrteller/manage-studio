/**
 * Which tax document was actually issued for a payment (payments.issued_document_kind).
 *
 * The finance page and the accountant export show VAT from this, never from business
 * status. NULL / undefined = unknown: the provider issued it and didn't say which type.
 * Pure, no imports: shared by the edge functions and the web app.
 */
export type IssuedDocumentKind = "receipt" | "tax_invoice_receipt" | "credit_note";

export const ISSUED_DOCUMENT_KINDS: readonly IssuedDocumentKind[] = [
  "receipt",
  "tax_invoice_receipt",
  "credit_note",
];

/** YPay docType: 108 receipt (קבלה), 109 invoice-receipt (חשבונית מס-קבלה). Anything else: unknown. */
export function documentKindFromYpayDocType(
  docType: number | string | null | undefined,
): IssuedDocumentKind | null {
  const n = Number(docType);
  if (n === 108) return "receipt";
  if (n === 109) return "tax_invoice_receipt";
  return null;
}

/** Green Invoice document type: 320 tax invoice-receipt, 400 receipt, 330 credit invoice. */
export function documentKindFromGreenInvoiceType(
  type: number | string | null | undefined,
): IssuedDocumentKind | null {
  const n = Number(type);
  if (n === 320) return "tax_invoice_receipt";
  if (n === 400) return "receipt";
  if (n === 330) return "credit_note";
  return null;
}
