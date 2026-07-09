/**
 * run-invoice-retry — pg_cron edge function (every minute)
 *
 * Spec: be-adapter-spec.md v1.4.0 §4(d) (Retry Queue Spec)
 *
 * Backoff schedule (attempt_count → next_retry_at):
 *   0 → immediate
 *   1 → +5 min
 *   2 → +15 min
 *   3 → +1 hr
 *   4 → +4 hr
 *   ≥5 → dead_lettered_at = NOW()
 *
 * On success: DELETE from retry queue.
 * On failure: increment attempt_count, update next_retry_at.
 * At 5 attempts: set dead_lettered_at.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { YeshInvoiceAdapter } from "../../_shared/payments/providers/yesh.ts";
import { MockYeshAdapter } from "../../_shared/payments/providers/mock-yesh.ts";

const BACKOFF_MINUTES = [0, 5, 15, 60, 240];
const MAX_ATTEMPTS = 5;

function nextRetryAt(attemptCount: number): string {
  const minutes = BACKOFF_MINUTES[Math.min(attemptCount, BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

Deno.serve(async (_req: Request) => {
  const service = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Fetch all due retry entries
  const { data: entries, error } = await service
    .from("invoice_retry_queue")
    .select("id, invoice_id, tenant_id, attempt_count, last_error_code")
    .lte("next_retry_at", new Date().toISOString())
    .is("dead_lettered_at", null)
    .order("next_retry_at")
    .limit(50); // batch cap per run

  if (error) {
    console.error("[run-invoice-retry] Failed to fetch retry queue:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!entries || entries.length === 0) {
    return Response.json({ processed: 0 });
  }

  const yeshMock = Deno.env.get("YESH_MOCK") === "true";
  let processed = 0;
  let deadLettered = 0;

  for (const entry of entries) {
    const { id, invoice_id, tenant_id, attempt_count } = entry as {
      id: string;
      invoice_id: string;
      tenant_id: string;
      attempt_count: number;
    };

    // Fetch the invoice to determine what to retry
    const { data: invoice } = await service
      .from("invoices")
      .select("id, yesh_docnum, b2b_flag, status, client_name, client_phone, amount, currency, line_items")
      .eq("id", invoice_id)
      .single();

    if (!invoice) {
      // Invoice was deleted — remove from queue
      await service.from("invoice_retry_queue").delete().eq("id", id);
      continue;
    }

    const newAttemptCount = (attempt_count as number) + 1;

    if (newAttemptCount > MAX_ATTEMPTS) {
      await service
        .from("invoice_retry_queue")
        .update({
          dead_lettered_at: new Date().toISOString(),
          attempt_count: newAttemptCount,
        })
        .eq("id", id);
      deadLettered++;
      console.warn(`[run-invoice-retry] Dead-lettered entry ${id} after ${newAttemptCount} attempts`);
      continue;
    }

    const invoiceData = invoice as {
      id: string;
      yesh_docnum: string | null;
      b2b_flag: boolean;
      status: string;
      client_name: string;
      client_phone: string | null;
      amount: string;
      currency: string;
      line_items: { description: string; quantity: number; unitPrice: string; totalPrice: string }[];
    };

    const invoicingProvider = yeshMock
      ? new MockYeshAdapter()
      : new YeshInvoiceAdapter(service);

    try {
      // Retry step: create Yesh invoice if not yet created
      if (!invoiceData.yesh_docnum) {
        const invoiceResp = await (invoicingProvider instanceof YeshInvoiceAdapter
          ? invoicingProvider.createInvoice({
              tenantId: tenant_id,
              clientName: invoiceData.client_name,
              clientPhone: invoiceData.client_phone ?? "",
              amount: invoiceData.amount,
              currency: invoiceData.currency as "ILS" | "USD" | "EUR",
              lineItems: invoiceData.line_items ?? [],
              b2bFlag: invoiceData.b2b_flag,
            })
          : invoicingProvider.createInvoice({
              tenantId: tenant_id,
              clientName: invoiceData.client_name,
              clientPhone: invoiceData.client_phone ?? "",
              amount: invoiceData.amount,
              currency: invoiceData.currency as "ILS" | "USD" | "EUR",
              lineItems: [],
              b2bFlag: invoiceData.b2b_flag,
            }));

        await service
          .from("invoices")
          .update({ yesh_docnum: invoiceResp.docnum, status: "invoice_created" })
          .eq("id", invoice_id);

        invoiceData.yesh_docnum = invoiceResp.docnum;
      }

      // Retry step: allocation if B2B and not yet obtained
      if (
        invoiceData.b2b_flag &&
        invoiceData.yesh_docnum &&
        invoiceData.status !== "fully_invoiced" &&
        invoicingProvider instanceof YeshInvoiceAdapter
      ) {
        const allocResp = await invoicingProvider.createITAAllocationForTenant(
          invoiceData.yesh_docnum,
          tenant_id,
        );
        await service
          .from("invoices")
          .update({
            allocation_number: allocResp.allocationNumber,
            allocation_status: allocResp.allocationNumber ? "obtained" : "not_required",
            allocation_skip_reason: allocResp.allocationNumber ? null : "yesh_returned_null",
            status: "fully_invoiced",
          })
          .eq("id", invoice_id);
      }

      // Success — remove from queue
      await service.from("invoice_retry_queue").delete().eq("id", id);
      processed++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await service
        .from("invoice_retry_queue")
        .update({
          attempt_count: newAttemptCount,
          next_retry_at: nextRetryAt(newAttemptCount),
          last_error_code: errMsg.slice(0, 200),
        })
        .eq("id", id);
      console.error(`[run-invoice-retry] Attempt ${newAttemptCount} failed for entry ${id}: ${errMsg}`);
    }
  }

  return Response.json({
    processed,
    dead_lettered: deadLettered,
    total: entries.length,
  });
});
