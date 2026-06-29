import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { fetchAndStoreBundledDocumentPdf } from "./bundled-document-pdf.ts";

/** Canonical bundled document fields — shared by Grow and iCount document webhooks. */
export interface ParsedBundledDocument {
  tenantId: string;
  providerPaymentRef: string;
  externalDocumentId: string;
  externalDocumentNumber?: string;
  documentUrl?: string;
}

export type BundledDocumentResult =
  | { status: "applied"; paymentId: string }
  | { status: "duplicate"; paymentId: string }
  | { status: "payment_not_found" };

/**
 * Apply a parsed bundled document notify to its payment row, idempotently.
 *
 * Grow and iCount both bundle invoicing with the charge; the document arrives on its own
 * webhook keyed by the same provider payment reference. We upsert document fields onto the
 * payment and settle any queued generic-issuance job so the invoicing worker never re-issues.
 */
export async function applyBundledDocumentNotify(
  service: SupabaseClient,
  parsed: ParsedBundledDocument,
): Promise<BundledDocumentResult> {
  const { data: payment, error: lookupError } = await service
    .from("payments")
    .select("id, external_document_id")
    .eq("tenant_id", parsed.tenantId)
    .eq("provider_payment_ref", parsed.providerPaymentRef)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!payment) return { status: "payment_not_found" };

  if (payment.external_document_id) {
    return { status: "duplicate", paymentId: payment.id as string };
  }

  const now = new Date().toISOString();

  let pdfPath: string | null = null;
  if (parsed.documentUrl) {
    const stored = await fetchAndStoreBundledDocumentPdf(service, {
      tenantId: parsed.tenantId,
      providerPaymentRef: parsed.providerPaymentRef,
      externalDocumentId: parsed.externalDocumentId,
      documentUrl: parsed.documentUrl,
    });
    pdfPath = stored.pdfPath;
  }

  const { error: updateError } = await service
    .from("payments")
    .update({
      external_document_id: parsed.externalDocumentId,
      external_document_number: parsed.externalDocumentNumber ?? null,
      invoice_url: parsed.documentUrl ?? null,
      invoice_issued_at: now,
      document_stored_at: parsed.documentUrl ? now : null,
      document_pdf_path: pdfPath,
    })
    .eq("id", payment.id);

  if (updateError) throw updateError;

  await service
    .from("document_queue")
    .update({ status: "succeeded", succeeded_at: now, last_error: null })
    .eq("payment_id", payment.id)
    .in("status", ["pending", "processing"]);

  return { status: "applied", paymentId: payment.id as string };
}
