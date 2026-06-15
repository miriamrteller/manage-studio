/**
 * issue-document — async tax document worker (Flow F).
 *
 * Invoked by pg_cron every 15 minutes (manual setup after deploy):
 * SELECT cron.schedule(
 *   'document-queue-retry',
 *   '*/15 * * * *',
 *   $$ SELECT net.http_post(
 *        url := '<issue-document-url>',
 *        headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
 *        body := '{"mode":"batch"}'::jsonb
 *      ); $$
 * );
 */
import { z } from "npm:zod@3.22.4";
import { jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { DOCUMENT_BATCH_SIZE } from "../_shared/invoicing/backoff.ts";
import {
  processQueueRow,
  resetStaleProcessingRows,
  type QueueRow,
} from "../_shared/invoicing/process-queue-row.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const IssueDocumentBodySchema = z.object({
  mode: z.literal("batch").optional(),
  queue_id: z.string().uuid().optional(),
  payment_id: z.string().uuid().optional(),
  document_kind: z.enum(["sale", "refund"]).optional(),
});

function authorizeCron(req: Request): boolean {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  return authHeader === `Bearer ${CRON_SECRET}` || cronHeader === CRON_SECRET;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!authorizeCron(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: z.infer<typeof IssueDocumentBodySchema> = {};
  try {
    const raw = await req.json();
    body = IssueDocumentBodySchema.parse(raw);
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const service = createServiceClient();
  const results: Record<string, number> = {
    staleReset: 0,
    processed: 0,
    succeeded: 0,
    retried: 0,
    dead: 0,
  };

  if (body.mode === "batch" || (!body.queue_id && !body.payment_id)) {
    results.staleReset = await resetStaleProcessingRows(service);

    const { data: dueRows, error } = await service
      .from("document_queue")
      .select("id, tenant_id, payment_id, document_kind, attempts, status")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(DOCUMENT_BATCH_SIZE);

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    for (const row of (dueRows ?? []) as QueueRow[]) {
      const outcome = await processQueueRow(service, row);
      results.processed += 1;
      if (outcome === "succeeded") results.succeeded += 1;
      else if (outcome === "retry") results.retried += 1;
      else results.dead += 1;
    }

    return jsonResponse({ ok: true, ...results });
  }

  let queueRow: QueueRow | null = null;

  if (body.queue_id) {
    const { data, error } = await service
      .from("document_queue")
      .select("id, tenant_id, payment_id, document_kind, attempts, status")
      .eq("id", body.queue_id)
      .maybeSingle();
    if (error || !data) {
      return jsonResponse({ error: "Queue row not found" }, 404);
    }
    queueRow = data as QueueRow;
  } else if (body.payment_id && body.document_kind) {
    const { data, error } = await service
      .from("document_queue")
      .select("id, tenant_id, payment_id, document_kind, attempts, status")
      .eq("payment_id", body.payment_id)
      .eq("document_kind", body.document_kind)
      .in("status", ["pending", "processing"])
      .maybeSingle();
    if (error || !data) {
      return jsonResponse({ error: "Queue row not found" }, 404);
    }
    queueRow = data as QueueRow;
  }

  if (!queueRow) {
    return jsonResponse({ error: "queue_id or payment_id+document_kind required" }, 400);
  }

  const outcome = await processQueueRow(service, queueRow);
  return jsonResponse({ ok: true, outcome });
});
