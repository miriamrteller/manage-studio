import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { fetchAndStoreBundledDocumentPdf } from "./bundled-document-pdf.ts";
import { sendPaymentDocumentAdminEmail } from "./send-payment-document-admin-email.ts";

/** Canonical bundled document fields — shared by Grow, iCount, and Invoice4U. */
export interface ParsedBundledDocument {
  tenantId: string;
  providerPaymentRef: string;
  externalDocumentId: string;
  externalDocumentNumber?: string;
  documentUrl?: string;
}

export type BundledDocumentResult =
  | { status: "applied"; paymentId: string; pdfStored: boolean }
  | { status: "duplicate"; paymentId: string; pdfStored: boolean }
  | { status: "payment_not_found" };

export const PAYMENT_DOCUMENT_RECORDED = "payment_document_recorded";

/** Persist tax-document fields on a payment and write an immutable audit row. */
export async function persistPaymentDocumentFields(
  service: SupabaseClient,
  params: {
    tenantId: string;
    paymentId: string;
    providerPaymentRef: string;
    externalDocumentId: string;
    externalDocumentNumber?: string | null;
    documentUrl?: string | null;
    /** When true, skip update if payment already has this (or any) document id. */
    skipIfPresent?: boolean;
  },
): Promise<{ status: "applied" | "duplicate"; pdfStored: boolean }> {
  if (params.skipIfPresent !== false) {
    const { data: existing, error: existingError } = await service
      .from("payments")
      .select("external_document_id")
      .eq("id", params.paymentId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.external_document_id) {
      return { status: "duplicate", pdfStored: false };
    }
  }

  const now = new Date().toISOString();
  let pdfPath: string | null = null;
  if (params.documentUrl) {
    const stored = await fetchAndStoreBundledDocumentPdf(service, {
      tenantId: params.tenantId,
      providerPaymentRef: params.providerPaymentRef,
      externalDocumentId: params.externalDocumentId,
      documentUrl: params.documentUrl,
    });
    pdfPath = stored.pdfPath;
  }

  const { error: updateError } = await service
    .from("payments")
    .update({
      external_document_id: params.externalDocumentId,
      external_document_number: params.externalDocumentNumber ?? null,
      invoice_url: params.documentUrl ?? null,
      invoice_issued_at: now,
      document_stored_at: pdfPath ? now : null,
      document_pdf_path: pdfPath,
    })
    .eq("id", params.paymentId);

  if (updateError) throw updateError;

  await service.from("audit_log").insert({
    tenant_id: params.tenantId,
    action: PAYMENT_DOCUMENT_RECORDED,
    entity_type: "payment",
    entity_id: params.paymentId,
    after_state: {
      external_document_id: params.externalDocumentId,
      external_document_number: params.externalDocumentNumber ?? null,
      invoice_url: params.documentUrl ?? null,
      document_pdf_path: pdfPath,
      pdf_stored: Boolean(pdfPath),
      provider_payment_ref: params.providerPaymentRef,
    },
  });

  // Best-effort immediate send; cron retries until payment_document_admin_email_sent.
  try {
    await sendPaymentDocumentAdminEmail(service, {
      tenantId: params.tenantId,
      paymentId: params.paymentId,
    });
  } catch (err) {
    console.error("[persistPaymentDocumentFields] admin document email failed:", err);
  }

  return { status: "applied", pdfStored: Boolean(pdfPath) };
}

/**
 * Apply a parsed bundled document notify to its payment row, idempotently.
 *
 * Grow / iCount document webhooks and Invoice4U payment callback share this path.
 * Always records document fields on `payments` and an audit_log trail row.
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
    return { status: "duplicate", paymentId: payment.id as string, pdfStored: false };
  }

  const persisted = await persistPaymentDocumentFields(service, {
    tenantId: parsed.tenantId,
    paymentId: payment.id as string,
    providerPaymentRef: parsed.providerPaymentRef,
    externalDocumentId: parsed.externalDocumentId,
    externalDocumentNumber: parsed.externalDocumentNumber,
    documentUrl: parsed.documentUrl,
    skipIfPresent: false,
  });

  const now = new Date().toISOString();
  await service
    .from("document_queue")
    .update({ status: "succeeded", succeeded_at: now, last_error: null })
    .eq("payment_id", payment.id)
    .in("status", ["pending", "processing"]);

  return {
    status: persisted.status,
    paymentId: payment.id as string,
    pdfStored: persisted.pdfStored,
  };
}
