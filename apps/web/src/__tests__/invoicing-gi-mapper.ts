import type { DocumentKind } from "../../../../supabase/functions/_shared/invoicing/types.ts";

/** Exported for unit tests — mirrors GreenInvoiceProvider internal mapping. */
export function giDocumentTypeForKind(kind: DocumentKind): number {
  return kind === "refund" ? 330 : 320;
}
