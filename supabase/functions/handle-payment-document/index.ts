import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { parseGrowInvoiceNotify } from "../_shared/payments/providers/grow.ts";

/**
 * GAP 5 — Receives Grow's invoice/document callback, persists document fields on the
 * matching payment row, and downloads an immutable PDF copy to Supabase Storage for
 * 7-year legal retention.
 *
 * Grow endpoint to register: POST /functions/v1/handle-payment-document
 * Register this URL in the Grow dashboard under "Document notifications" (מסמכים).
 *
 * Idempotent: safe to replay. Duplicate calls with the same externalDocumentId are
 * detected and return { ok: true, duplicate: true } without re-uploading the PDF.
 */
serve(async (req: Request) => {
  try {
    const body = await req.json() as Record<string, unknown>;
    let parsed: ReturnType<typeof parseGrowInvoiceNotify>;

    try {
      parsed = parseGrowInvoiceNotify(body);
    } catch (parseErr) {
      console.error("handle-payment-document: parse error", parseErr);
      // Return 400 so Grow knows not to retry a malformed payload
      return new Response(
        JSON.stringify({ error: String(parseErr) }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Look up the matching payment row by providerPaymentRef + tenantId
    const { data: payment, error: lookupErr } = await supabase
      .from("payments")
      .select("id, external_document_id")
      .eq("provider_payment_ref", parsed.providerPaymentRef)
      .eq("tenant_id", parsed.tenantId)
      .maybeSingle();

    if (lookupErr) throw lookupErr;

    if (!payment) {
      // Unknown transaction — return 200 so Grow does not endlessly retry
      console.warn(
        "handle-payment-document: no matching payment for ref",
        parsed.providerPaymentRef,
        "tenant",
        parsed.tenantId,
      );
      return new Response(
        JSON.stringify({ ok: true, skipped: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Idempotency guard — skip if this exact document is already stored
    if (payment.external_document_id === parsed.externalDocumentId) {
      return new Response(
        JSON.stringify({ ok: true, duplicate: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Download PDF to Supabase Storage (legal copy — immutable, upsert: false)
    let pdfPath: string | null = null;
    if (parsed.documentUrl) {
      try {
        const pdfRes = await fetch(parsed.documentUrl, { signal: AbortSignal.timeout(30_000) });
        if (pdfRes.ok) {
          const pdfBytes = await pdfRes.arrayBuffer();
          // Path pattern: documents/{tenantId}/{providerPaymentRef}/{documentId}.pdf
          // Opaque keys — no PII in the path (MD-004)
          pdfPath = `documents/${parsed.tenantId}/${parsed.providerPaymentRef}/${parsed.externalDocumentId}.pdf`;
          const { error: uploadErr } = await supabase.storage
            .from("legal-documents")
            .upload(pdfPath, pdfBytes, {
              contentType: "application/pdf",
              upsert: false, // never overwrite — immutable legal copy
            });
          if (uploadErr) {
            // Non-fatal: log and continue. The Grow-hosted URL is still stored as a fallback.
            console.error("handle-payment-document: PDF upload failed (non-fatal):", uploadErr.message);
            pdfPath = null;
          }
        } else {
          console.warn("handle-payment-document: PDF fetch returned", pdfRes.status, "(non-fatal)");
        }
      } catch (fetchErr) {
        console.error("handle-payment-document: PDF fetch error (non-fatal):", fetchErr);
      }
    }

    // 4. Persist document fields on the payment row
    const { error: updateErr } = await supabase
      .from("payments")
      .update({
        external_document_id:     parsed.externalDocumentId,
        external_document_number: parsed.externalDocumentNumber ?? null,
        invoice_url:              parsed.documentUrl ?? null, // existing column — convenience URL
        document_stored_at:       new Date().toISOString(),
        document_pdf_path:        pdfPath,
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

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("handle-payment-document: unhandled error", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
