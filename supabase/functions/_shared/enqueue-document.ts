import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { getEnv } from "./edge-runtime/env.ts";
import { isTenantInvoicingOff } from "./invoicing/tenant-invoicing.ts";
import type { DocumentKind } from "./invoicing/types.ts";

export const DOCUMENT_ENQUEUE_SKIPPED = "document_enqueue_skipped";

interface EnqueueParams {
  tenantId: string;
  paymentId: string;
  documentKind: DocumentKind;
}

const ISSUE_DOCUMENT_URL = getEnv("ISSUE_DOCUMENT_URL") ?? "";
const SYNC_ISSUE_DOCUMENT_IN_DEV = getEnv("SYNC_ISSUE_DOCUMENT_IN_DEV") === "true";

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" || (error.message ?? "").includes("duplicate key");
}

/** Fire-and-forget invoke of issue-document (cron batch is the guarantee). */
async function invokeIssueDocument(payload: Record<string, unknown>): Promise<void> {
  if (!ISSUE_DOCUMENT_URL) return;
  try {
    await fetch(ISSUE_DOCUMENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getEnv("CRON_SECRET")
          ? { "x-cron-secret": getEnv("CRON_SECRET") ?? "" }
          : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[enqueueDocument] issue-document invoke failed:", err);
  }
}

async function processQueueInline(
  service: SupabaseClient,
  queueId: string,
): Promise<void> {
  const { processQueueRow } = await import("./invoicing/process-queue-row.ts");
  const { data: row, error } = await service
    .from("document_queue")
    .select("id, tenant_id, payment_id, document_kind, attempts, status")
    .eq("id", queueId)
    .single();

  if (error || !row) {
    console.warn("[enqueueDocument] inline process: queue row not found", queueId, error?.message);
    return;
  }

  await processQueueRow(service, row as {
    id: string;
    tenant_id: string;
    payment_id: string;
    document_kind: DocumentKind;
    attempts: number;
    status: string;
  });
}

export async function enqueueDocument(
  service: SupabaseClient,
  params: EnqueueParams,
): Promise<{ queued: boolean; queueId?: string; skipped?: "invoicing_off" }> {
  // Invoicing off: never queue a tax document. Without this the default resolver
  // ('grow', no credentials) would retry, die and page the admin for every cash payment.
  if (await isTenantInvoicingOff(service, params.tenantId)) {
    await service.from("audit_log").insert({
      tenant_id: params.tenantId,
      action: DOCUMENT_ENQUEUE_SKIPPED,
      entity_type: "payment",
      entity_id: params.paymentId,
      after_state: { reason: "invoicing_off", document_kind: params.documentKind },
    });
    return { queued: false, skipped: "invoicing_off" };
  }

  const { data, error } = await service
    .from("document_queue")
    .insert({
      tenant_id: params.tenantId,
      payment_id: params.paymentId,
      document_kind: params.documentKind,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return { queued: false };
    }
    throw error;
  }

  const queueId = data.id as string;

  if (ISSUE_DOCUMENT_URL) {
    await invokeIssueDocument({ queue_id: queueId });
  } else if (SYNC_ISSUE_DOCUMENT_IN_DEV) {
    try {
      await processQueueInline(service, queueId);
    } catch (err) {
      console.warn("[enqueueDocument] inline processQueueRow failed:", err);
    }
  } else {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "document_queue_pending_no_worker",
        queue_id: queueId,
        payment_id: params.paymentId,
        hint: "Set ISSUE_DOCUMENT_URL or SYNC_ISSUE_DOCUMENT_IN_DEV=true",
      }),
    );
  }

  return { queued: true, queueId };
}
