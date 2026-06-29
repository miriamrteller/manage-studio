import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { handlePaymentDocumentInternal } from "../_shared/payments/handle-payment-document.ts";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const result = await handlePaymentDocumentInternal(supabase, body);

    if (!result.ok) {
      console.error("handle-payment-document: parse error", result.error);
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (result.skipped) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (result.duplicate) {
      return new Response(
        JSON.stringify({ ok: true, duplicate: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

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
