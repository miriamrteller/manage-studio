/**
 * run-enrolment-payment-dunning
 *
 * Daily cron at 03:00 Asia/Jerusalem (00:00 UTC in winter / 01:00 UTC in summer).
 * Invoke via pg_cron net.http_post with x-cron-secret, or POST manually with CRON_SECRET.
 *
 * Processes unpaid pending_payment engagements on Day 3 / 7 / 14 ladder.
 */

import { jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient } from "../../packages/edge-runtime/src/supabase.ts";
import { applyEnrolmentPaymentDunningStep } from "../_shared/collections/apply-enrolment-payment-dunning-step.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BATCH_LIMIT = 100;

function authorizeCron(req: Request): boolean {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  return authHeader === `Bearer ${CRON_SECRET}` || cronHeader === CRON_SECRET;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!authorizeCron(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const service = createServiceClient();
  const nowIso = new Date().toISOString();
  const appBaseUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

  if (!appBaseUrl) {
    console.warn(
      "[run-enrolment-payment-dunning] APP_URL not set — reminders skip send; day-14 cancel still runs",
    );
  }

  const { data: rows, error } = await service
    .from("engagements")
    .select("id")
    .eq("status", "pending_payment")
    .lt("payment_dunning_attempt_count", 3)
    .or(
      `payment_dunning_next_at.lte.${nowIso},and(payment_dunning_next_at.is.null,payment_dunning_attempt_count.eq.0)`,
    )
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[run-enrolment-payment-dunning] fetch error:", error);
    return jsonResponse({ error: error.message }, 500);
  }

  const engagements = rows ?? [];

  if (engagements.length === BATCH_LIMIT) {
    console.warn(
      "[run-enrolment-payment-dunning] WARNING: query returned BATCH_LIMIT rows — " +
        "there may be more unprocessed records. Consider increasing run frequency.",
    );
  }

  const results: Record<string, string[]> = {
    reminded: [],
    cancelled: [],
    skipped: [],
    errors: [],
  };

  for (const row of engagements) {
    try {
      const result = await applyEnrolmentPaymentDunningStep(
        service,
        row.id as string,
        appBaseUrl,
      );

      if (result.outcome === "reminded") {
        results.reminded.push(row.id as string);
      } else if (result.outcome === "cancelled") {
        results.cancelled.push(row.id as string);
      } else if (result.outcome === "skipped") {
        results.skipped.push(`${row.id}:${result.reason}`);
      } else {
        results.errors.push(`${row.id}:${result.message}`);
      }
    } catch (err) {
      console.error("[run-enrolment-payment-dunning] unexpected error:", err, { id: row.id });
      results.errors.push(`${row.id}:unexpected`);
    }
  }

  console.log("[run-enrolment-payment-dunning] done:", {
    processed: engagements.length,
    ...results,
  });

  return jsonResponse({
    ok: true,
    processed: engagements.length,
    results,
  });
});
