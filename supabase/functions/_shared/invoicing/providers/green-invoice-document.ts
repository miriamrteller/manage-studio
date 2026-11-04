/**
 * Pure Green Invoice document helpers (no imports, so the web tests can load them).
 *
 * Document types: 400 receipt (קבלה), 320 tax invoice-receipt (חשבונית מס קבלה),
 * 330 credit invoice (חשבונית זיכוי).
 */
import type { CanonicalDocumentInput, DocumentKind } from "../types.ts";

export const GI_DOC_TYPE_RECEIPT = 400;
export const GI_DOC_TYPE_INVOICE_RECEIPT = 320;
export const GI_DOC_TYPE_CREDIT = 330;

/**
 * The document for a sale is the studio's own choice (Settings -> Tax documents ->
 * "Which document does Green Invoice issue?", tenants.green_invoice_document_type), prefilled
 * from business status but never inferred from it here. Anything but 400 means 320.
 * Refunds get a credit invoice; refunds for receipt studios are not queued (enqueue-document).
 */
export function giDocumentType(kind: DocumentKind, saleType: number | string | null | undefined): number {
  if (kind === "refund") return GI_DOC_TYPE_CREDIT;
  return Number(saleType) === GI_DOC_TYPE_RECEIPT ? GI_DOC_TYPE_RECEIPT : GI_DOC_TYPE_INVOICE_RECEIPT;
}

/**
 * Green Invoice payment types: 1 cash, 3 credit card, 4 bank transfer, 10 payment app,
 * 11 other. [[CONFIRM against the Green Invoice API docs: the docs host was blocked here.]]
 */
export const GI_PAYMENT_TYPE: Record<NonNullable<CanonicalDocumentInput["paymentMethod"]>, number> = {
  cash: 1,
  card: 3,
  bank_transfer: 4,
  bit: 10,
  other: 11,
};

/**
 * The "payment" rows a receipt or invoice-receipt carries: how and when the money came in,
 * for the full amount. Credit invoices carry none.
 */
export function giPaymentRows(
  input: Pick<CanonicalDocumentInput, "documentKind" | "paymentMethod" | "paidAt" | "totalAmountMinor">,
  today: string = new Date().toISOString().slice(0, 10),
): Array<{ type: number; price: number; date: string }> {
  if (input.documentKind === "refund") return [];
  return [
    {
      type: GI_PAYMENT_TYPE[input.paymentMethod ?? "card"] ?? GI_PAYMENT_TYPE.other,
      price: input.totalAmountMinor / 100,
      date: input.paidAt ? input.paidAt.slice(0, 10) : today,
    },
  ];
}
