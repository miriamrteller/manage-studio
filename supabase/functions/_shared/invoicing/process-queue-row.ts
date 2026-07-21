import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { persistPaymentDocumentFields } from "../payments/bundled-document.ts";
import { buildCanonicalDocumentInput } from "./build-canonical-input.ts";
import {
  backoffScheduledFor,
  MAX_DOCUMENT_ATTEMPTS,
  STALE_PROCESSING_MINUTES,
} from "./backoff.ts";
import { getInvoicingProviderForTenant } from "./index.ts";
import type { DocumentKind } from "./types.ts";
import { InvoicingProviderError } from "./types.ts";

export interface QueueRow {
  id: string;
  tenant_id: string;
  payment_id: string;
  document_kind: DocumentKind;
  attempts: number;
  status: string;
}

export async function resetStaleProcessingRows(service: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await service
    .from("document_queue")
    .update({ status: "pending", processing_started_at: null })
    .eq("status", "processing")
    .lt("processing_started_at", cutoff)
    .select("id");

  if (error) {
    console.error("[issue-document] stale sweep failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

export async function processQueueRow(
  service: SupabaseClient,
  row: QueueRow,
): Promise<"succeeded" | "retry" | "dead"> {
  const now = new Date().toISOString();

  const { error: lockError } = await service
    .from("document_queue")
    .update({ status: "processing", processing_started_at: now })
    .eq("id", row.id)
    .in("status", ["pending", "processing"]);

  if (lockError) {
    console.error("[issue-document] lock failed:", lockError.message);
    return "retry";
  }

  try {
    const input = await buildCanonicalDocumentInput(service, {
      paymentId: row.payment_id,
      documentKind: row.document_kind,
    });
    const provider = await getInvoicingProviderForTenant(service, row.tenant_id);
    await provider.authenticate(service, row.tenant_id);
    const result = await provider.issueDocument(service, input);

    const { data: paymentRow, error: paymentLookupError } = await service
      .from("payments")
      .select("id, provider_payment_ref, external_document_id")
      .eq("id", row.payment_id)
      .maybeSingle();

    if (paymentLookupError) {
      throw new InvoicingProviderError(`Payment lookup failed: ${paymentLookupError.message}`, {
        retryable: true,
      });
    }
    if (!paymentRow) {
      throw new InvoicingProviderError("Payment not found for document queue row", {
        retryable: false,
      });
    }

    // Shared persist + audit trail (same as Grow / iCount / Invoice4U bundled path).
    await persistPaymentDocumentFields(service, {
      tenantId: row.tenant_id,
      paymentId: row.payment_id,
      providerPaymentRef:
        (paymentRow.provider_payment_ref as string | null) ?? row.payment_id,
      externalDocumentId: result.externalDocumentId,
      externalDocumentNumber: result.externalDocumentNumber,
      documentUrl: result.documentUrl,
      skipIfPresent: true,
    });

    await service
      .from("document_queue")
      .update({ status: "succeeded", succeeded_at: now, last_error: null })
      .eq("id", row.id);

    return "succeeded";
  } catch (err) {
    const retryable =
      err instanceof InvoicingProviderError ? err.retryable : true;
    const message = err instanceof Error ? err.message : "Unknown error";
    const nextAttempts = row.attempts + 1;
    const isDead = !retryable || nextAttempts >= MAX_DOCUMENT_ATTEMPTS;

    await service
      .from("document_queue")
      .update({
        status: isDead ? "dead" : "pending",
        attempts: nextAttempts,
        last_error: message,
        processing_started_at: null,
        scheduled_for: isDead ? now : backoffScheduledFor(nextAttempts),
      })
      .eq("id", row.id);

    if (isDead) {
      const { data: existingAlert } = await service
        .from("audit_log")
        .select("id")
        .eq("tenant_id", row.tenant_id)
        .eq("action", "document_queue_dead_alert")
        .eq("entity_id", row.id)
        .maybeSingle();

      if (!existingAlert) {
        await service.from("audit_log").insert({
          tenant_id: row.tenant_id,
          action: "document_queue_dead_alert",
          entity_type: "document_queue",
          entity_id: row.id,
          after_state: { payment_id: row.payment_id, last_error: message },
        });
      }
    }

    return isDead ? "dead" : "retry";
  }
}
