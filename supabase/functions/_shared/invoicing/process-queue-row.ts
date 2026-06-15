import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
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

    const { error: paymentError } = await service
      .from("payments")
      .update({
        external_document_id: result.externalDocumentId,
        external_document_number: result.externalDocumentNumber,
        invoice_url: result.documentUrl,
        invoice_issued_at: now,
      })
      .eq("id", row.payment_id);

    if (paymentError) {
      throw new InvoicingProviderError(`Payment update failed: ${paymentError.message}`, {
        retryable: true,
      });
    }

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
