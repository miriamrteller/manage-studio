import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { applyBundledDocumentNotify } from "./bundled-document.ts";
import { parseGrowInvoiceNotify } from "./providers/grow.ts";

export type HandlePaymentDocumentResult =
  | { ok: true; duplicate?: boolean; skipped?: boolean }
  | { ok: false; status: 400; error: string };

/**
 * Grow document callback — persists document fields, optional PDF retention, and audit trail
 * via the shared bundled-document path (same as handle-invoice-event / Invoice4U).
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

  const result = await applyBundledDocumentNotify(service, parsed);

  if (result.status === "payment_not_found") {
    console.warn(
      "handle-payment-document: no matching payment for ref",
      parsed.providerPaymentRef,
      "tenant",
      parsed.tenantId,
    );
    return { ok: true, skipped: true };
  }

  if (result.status === "duplicate") {
    return { ok: true, duplicate: true };
  }

  console.info(
    "handle-payment-document: stored document",
    parsed.externalDocumentId,
    "for payment",
    result.paymentId,
    result.pdfStored ? "with PDF" : "URL only",
  );

  return { ok: true };
}
