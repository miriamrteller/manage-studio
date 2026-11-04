import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { getEnv } from "./edge-runtime/env.ts";
import type { DocumentKind } from "./invoicing/types.ts";

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

/** True when the tenant's invoicing_provider is "none". */
export async function tenantIssuesNoDocuments(
  service: SupabaseClient,
  tenantId: string,
): Promise<boolean> {
  const { data } = await service
    .from("tenants")
    .select("invoicing_provider")
    .eq("id", tenantId)
    .maybeSingle();
  return data?.invoicing_provider === "none";
}

/** Invoicing services that only issue a document together with their own card charge. */
export const BUNDLED_ONLY_INVOICING = ["grow", "icount", "invoice4u"] as const;

/**
 * Unfinished invoicing services: their document call is not built yet (live API access
 * pending), so no document of any kind can come from OpalSwift. Recorded as not issued
 * instead of failing in the queue (payments audit follow-up).
 */
export const NO_DOCUMENTS_YET_INVOICING = ["tranzila", "yesh"] as const;

export type DocumentRoute =
  | { route: "queue" }
  | { route: "skip_no_documents" }
  /** The provider issues it with its own charge; it arrives on the provider's notice. */
  | { route: "skip_issued_with_charge" }
  /** The provider has no standalone documents: record it as not issued (no retries, no alert). */
  | { route: "not_issued"; reason: string };

/**
 * Pure: what to do with a document for this payment. Grow, iCount and Invoice4U have no
 * standalone document API, so a cash / bank-transfer payment, another provider's payment or a
 * refund can never get a document from them (payments audit P2 #12).
 */
export function documentRouteFor(input: {
  invoicingProvider: string | null | undefined;
  paymentProvider: string | null | undefined;
  documentKind: DocumentKind;
}): DocumentRoute {
  const invoicing = input.invoicingProvider ?? "";
  if (invoicing === "none") return { route: "skip_no_documents" };
  if ((NO_DOCUMENTS_YET_INVOICING as readonly string[]).includes(invoicing)) {
    return {
      route: "not_issued",
      reason: `${invoicing} documents can't be issued from OpalSwift yet; issue this document in ${invoicing}`,
    };
  }
  if (!(BUNDLED_ONLY_INVOICING as readonly string[]).includes(invoicing)) return { route: "queue" };
  if (input.documentKind === "sale" && input.paymentProvider === invoicing) {
    return { route: "skip_issued_with_charge" };
  }
  return {
    route: "not_issued",
    reason: input.documentKind === "refund"
      ? `${invoicing} cannot issue a refund document from OpalSwift; issue the credit document in ${invoicing}`
      : `${invoicing} only issues documents with its own card payments; issue this receipt yourself, ` +
        `or use Green Invoice or YPay for cash receipts`,
  };
}

export async function enqueueDocument(
  service: SupabaseClient,
  params: EnqueueParams,
): Promise<{ queued: boolean; queueId?: string; notIssued?: boolean }> {
  const [{ data: tenant }, { data: payment }] = await Promise.all([
    service.from("tenants").select("invoicing_provider").eq("id", params.tenantId).maybeSingle(),
    service.from("payments").select("provider").eq("id", params.paymentId).maybeSingle(),
  ]);
  const decision = documentRouteFor({
    invoicingProvider: tenant?.invoicing_provider as string | null | undefined,
    paymentProvider: payment?.provider as string | null | undefined,
    documentKind: params.documentKind,
  });

  // A studio with invoicing off (e.g. not a registered business) gets no tax
  // documents at all: nothing is queued, so nothing retries or alerts admins.
  if (decision.route === "skip_no_documents" || decision.route === "skip_issued_with_charge") {
    return { queued: false };
  }

  if (decision.route === "not_issued") {
    // One record per payment and kind: a replayed finalise must not add a second row.
    const { data: existing } = await service
      .from("document_queue")
      .select("id")
      .eq("payment_id", params.paymentId)
      .eq("document_kind", params.documentKind)
      .eq("status", "not_issued")
      .maybeSingle();
    if (existing) return { queued: false, notIssued: true };
    const { error: notIssuedError } = await service.from("document_queue").insert({
      tenant_id: params.tenantId,
      payment_id: params.paymentId,
      document_kind: params.documentKind,
      status: "not_issued",
      last_error: decision.reason,
    });
    if (notIssuedError && !isUniqueViolation(notIssuedError)) throw notIssuedError;
    return { queued: false, notIssued: true };
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
