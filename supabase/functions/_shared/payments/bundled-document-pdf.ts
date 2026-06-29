import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export async function fetchAndStoreBundledDocumentPdf(
  service: SupabaseClient,
  params: {
    tenantId: string;
    providerPaymentRef: string;
    externalDocumentId: string;
    documentUrl: string;
  },
): Promise<{ pdfPath: string | null }> {
  const { tenantId, providerPaymentRef, externalDocumentId, documentUrl } = params;

  try {
    const pdfRes = await fetch(documentUrl, { signal: AbortSignal.timeout(30_000) });
    if (!pdfRes.ok) {
      console.warn(
        "fetchAndStoreBundledDocumentPdf: PDF fetch returned",
        pdfRes.status,
        "(non-fatal)",
      );
      return { pdfPath: null };
    }

    const pdfBytes = await pdfRes.arrayBuffer();
    const pdfPath =
      `documents/${tenantId}/${providerPaymentRef}/${externalDocumentId}.pdf`;

    const { error: uploadErr } = await service.storage
      .from("legal-documents")
      .upload(pdfPath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadErr) {
      console.error(
        "fetchAndStoreBundledDocumentPdf: PDF upload failed (non-fatal):",
        uploadErr.message,
      );
      return { pdfPath: null };
    }

    return { pdfPath };
  } catch (fetchErr) {
    console.error("fetchAndStoreBundledDocumentPdf: PDF fetch error (non-fatal):", fetchErr);
    return { pdfPath: null };
  }
}
