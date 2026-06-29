import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { fetchAndStoreBundledDocumentPdf } from "./bundled-document-pdf.ts";
import { parseGrowInvoiceNotify } from "./providers/grow.ts";

export type HandlePaymentDocumentResult =
  | { ok: true; duplicate?: boolean; skipped?: boolean }
  | { ok: false; status: 400; error: string };

/**
 * Grow document callback — persists document fields and optional PDF retention copy.
 * HTTP edge wrapper lives in handle-payment-document/index.ts.
 */
export async function handlePaymentDocumentInternal(
  service: SupabaseClient,
  body: Record<string, unknown>,
): Promise<HandlePaymentDocumentResult> {
  let parsed: ReturnType<typeof parseGrowInvoiceNotify>;
  try {
    parsed = parseGrowInvoiceNotify(body);
  } catch (parseErr) {
    return {
      ok: false,
      status: 400,
      error: String(parseErr),
    };
  }

  const { data: payment, error: lookupErr } = await service
    .from("payments")
    .select("id, external_document_id")
    .eq("provider_payment_ref", parsed.providerPaymentRef)
    .eq("tenant_id", parsed.tenantId)
    .maybeSingle();

  if (lookupErr) throw lookupErr;

  if (!payment) {
    console.warn(
      "handle-payment-document: no matching payment for ref",
      parsed.providerPaymentRef,
      "tenant",
      parsed.tenantId,
    );
    return { ok: true, skipped: true };
  }

  if (payment.external_document_id === parsed.externalDocumentId) {
    return { ok: true, duplicate: true };
  }

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

  const { error: updateErr } = await service
    .from("payments")
    .update({
      external_document_id: parsed.externalDocumentId,
      external_document_number: parsed.externalDocumentNumber ?? null,
      invoice_url: parsed.documentUrl ?? null,
      document_stored_at: new Date().toISOString(),
      document_pdf_path: pdfPath,
    })
    .eq("id", payment.id);

  if (updateErr) throw updateErr;

  console.info(
    "handle-payment-document: stored document",
    parsed.externalDocumentId,
    "for payment",
    payment.id,
    pdfPath ? "with PDF" : "URL only",
  );

  return { ok: true };
}
