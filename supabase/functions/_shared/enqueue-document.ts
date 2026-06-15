import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import type { DocumentKind } from "./invoicing/types.ts";

interface EnqueueParams {
  tenantId: string;
  paymentId: string;
  documentKind: DocumentKind;
}

const ISSUE_DOCUMENT_URL = Deno.env.get("ISSUE_DOCUMENT_URL") ?? "";

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
        ...(Deno.env.get("CRON_SECRET")
          ? { "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "" }
          : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[enqueueDocument] issue-document invoke failed:", err);
  }
}

export async function enqueueDocument(
  service: SupabaseClient,
  params: EnqueueParams,
): Promise<{ queued: boolean; queueId?: string }> {
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
  await invokeIssueDocument({ queue_id: queueId });
  return { queued: true, queueId };
}
