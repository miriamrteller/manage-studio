import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

/**
 * GAP 5 — Admin-triggered document resend.
 * Generates a 48-hour signed URL for the stored legal PDF and returns it to
 * the caller (admin UI or API). Grow has no resend endpoint — we serve from
 * our own immutable storage copy.
 *
 * Body: { payment_id: string; recipient_email?: string }
 * Auth: service_role JWT (called server-side from admin API route)
 *
 * Audit: every resend is logged to payment_document_access_log.
 */
serve(async (req: Request) => {
  try {
    const { payment_id, recipient_email } = await req.json() as {
      payment_id: string;
      recipient_email?: string;
    };

    if (!payment_id) {
      return new Response(
        JSON.stringify({ error: "payment_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch document fields for this payment
    const { data, error } = await supabase
      .from("payments")
      .select([
        "id",
        "invoice_url",
        "document_pdf_path",
        "external_document_number",
        "external_document_id",
        "tenant_id",
        "person_id",
      ].join(", "))
      .eq("id", payment_id)
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: "Payment not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!data.invoice_url && !data.document_pdf_path) {
      return new Response(
        JSON.stringify({ error: "No document stored for this payment yet" }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }

    // Generate a 48-hour signed URL from our immutable storage copy (preferred).
    // Fall back to Grow-hosted invoice_url if no PDF was uploaded yet.
    let downloadUrl: string = data.invoice_url ?? "";
    if (data.document_pdf_path) {
      const { data: signed, error: signErr } = await supabase.storage
        .from("legal-documents")
        .createSignedUrl(data.document_pdf_path, 60 * 60 * 48); // 48 hours

      if (signErr || !signed?.signedUrl) {
        console.error("admin-resend-document: signed URL error (non-fatal, falling back to invoice_url)", signErr);
      } else {
        downloadUrl = signed.signedUrl;
      }
    }

    if (!downloadUrl) {
      return new Response(
        JSON.stringify({ error: "Unable to generate a document URL" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Audit log — originating admin is tracked at the API gateway / caller level
    await supabase.from("payment_document_access_log").insert({
      payment_id,
      accessed_by: null, // service-role action
      action: "resend",
    });

    // TODO: wire to transactional email provider (Resend / Postmark / Brevo) when ready.
    // For now, return the signed URL and document metadata to the admin caller so the
    // admin UI can display or forward it. The recipient_email field is accepted for
    // forward-compatibility but not yet consumed.
    console.info(
      "admin-resend-document: resend prepared for payment",
      payment_id,
      recipient_email ? `→ ${recipient_email}` : "(no email supplied)",
    );

    return new Response(
      JSON.stringify({
        ok: true,
        payment_id,
        document_id: data.external_document_id,
        document_number: data.external_document_number,
        download_url: downloadUrl,
        url_expires_in_hours: data.document_pdf_path ? 48 : null,
        recipient_email: recipient_email ?? null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("admin-resend-document: unhandled error", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
