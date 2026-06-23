import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import type { ParsedGrowInvoice } from "../providers/grow.ts";

export type GrowInvoiceResult =
  | { status: "applied"; paymentId: string }
  | { status: "duplicate"; paymentId: string }
  | { status: "payment_not_found" };

/**
 * Apply a parsed Grow document notify to its payment row, idempotently.
 *
 * Grow bundles invoicing with the charge, so the document arrives on its own webhook. We upsert
 * the document fields onto the payment and settle any queued generic-issuance job so the
 * invoicing worker never re-issues. If the payment already carries an `external_document_id`
 * the call is a no-op (`duplicate`), which makes redelivered webhooks safe.
 */
export async function applyGrowInvoiceNotify(
  service: SupabaseClient,
  parsed: ParsedGrowInvoice,
): Promise<GrowInvoiceResult> {
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
  const { error: updateError } = await service
    .from("payments")
    .update({
      external_document_id: parsed.externalDocumentId,
      external_document_number: parsed.externalDocumentNumber ?? null,
      invoice_url: parsed.documentUrl ?? null,
      invoice_issued_at: now,
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
