import { z } from "npm:zod@3.22.4";
import { jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { processBillingSchedule } from "../_shared/payments/renewal-billing.ts";
import {
  currentPeriodYmJerusalem,
  todayInJerusalem,
} from "../_shared/payments/billing-time.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BATCH_LIMIT = 50;

const BodySchema = z.object({
  mode: z.enum(["batch", "single"]).optional(),
  schedule_id: z.string().uuid().optional(),
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

  let body: z.infer<typeof BodySchema> = { mode: "batch" };
  try {
    const raw = await req.text();
    if (raw) body = BodySchema.parse(JSON.parse(raw));
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }

  const service = createServiceClient();
  const today = todayInJerusalem();
  const periodYm = currentPeriodYmJerusalem();

  let query = service
    .from("billing_schedules")
    .select(
      "id, tenant_id, engagement_id, billing_account_id, next_billing_date, next_attempt_at, attempt_count, payment_method_token_id",
    )
    .eq("status", "active")
    .limit(BATCH_LIMIT);

  if (body.mode === "single" && body.schedule_id) {
    query = query.eq("id", body.schedule_id);
  } else {
    query = query.or(
      `and(next_attempt_at.not.is.null,next_attempt_at.lte.${new Date().toISOString()}),and(next_attempt_at.is.null,next_billing_date.lte.${today})`,
    );
  }

  const { data: schedules, error } = await query;
  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  let processed = 0;
  let charged = 0;
  let failed = 0;

  for (const schedule of schedules ?? []) {
    processed += 1;
    const result = await processBillingSchedule(
      service,
      {
        id: schedule.id as string,
        tenant_id: schedule.tenant_id as string,
        engagement_id: schedule.engagement_id as string,
        billing_account_id: schedule.billing_account_id as string | null,
        attempt_count: schedule.attempt_count as number,
      },
      periodYm,
    );

    if (result.outcome === "charged") {
      charged += 1;
    } else if (result.outcome === "failed") {
      failed += 1;
    } else {
      failed += 1;
    }
  }

  return jsonResponse({ ok: true, processed, charged, failed });
});
