/**
 * run-job-payment-reminders
 *
 * Daily cron (06:00 UTC, see 20261030000200). Sends the balance/deposit pay
 * link DUE_SOON_DAYS before due_date and one overdue reminder afterwards, for
 * every collectable job payment request. Idempotent per request/kind.
 */
import { jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import {
  applyJobPaymentReminderStep,
  DUE_SOON_DAYS,
  todayInJerusalem,
} from "../_shared/jobs/apply-request-reminder-step.ts";
import { JOB_PAYMENT_REQUEST_COLUMNS, type JobPaymentRequestRow } from "../_shared/jobs/load-request.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BATCH_LIMIT = 200;

function authorizeCron(req: Request): boolean {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  return authHeader === `Bearer ${CRON_SECRET}` || cronHeader === CRON_SECRET;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!authorizeCron(req)) return jsonResponse({ error: "Unauthorized" }, 401);

  const service = createServiceClient();
  const todayIso = todayInJerusalem();
  const horizon = new Date(`${todayIso}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + DUE_SOON_DAYS);

  const { data: rows, error } = await service
    .from("job_payment_requests")
    .select(JOB_PAYMENT_REQUEST_COLUMNS)
    .in("status", ["pending", "sent"])
    .not("due_date", "is", null)
    .lte("due_date", horizon.toISOString().slice(0, 10))
    .or("due_reminder_sent_at.is.null,overdue_reminder_sent_at.is.null")
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[run-job-payment-reminders] fetch error:", error);
    return jsonResponse({ error: error.message }, 500);
  }

  const results: Record<string, string[]> = { reminded: [], skipped: [], errors: [] };
  for (const row of (rows ?? []) as unknown as JobPaymentRequestRow[]) {
    try {
      const r = await applyJobPaymentReminderStep(service, row, todayIso);
      if (r.outcome === "reminded") results.reminded.push(`${row.id}:${r.kind}`);
      else if (r.outcome === "skipped") results.skipped.push(`${row.id}:${r.reason}`);
      else results.errors.push(`${row.id}:${r.message}`);
    } catch (err) {
      console.error("[run-job-payment-reminders] unexpected:", err, { id: row.id });
      results.errors.push(`${row.id}:unexpected`);
    }
  }

  console.log("[run-job-payment-reminders] done:", { processed: rows?.length ?? 0, ...results });
  return jsonResponse({ ok: true, today: todayIso, processed: rows?.length ?? 0, results });
});
