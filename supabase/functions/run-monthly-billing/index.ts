import { z } from "npm:zod@3.22.4";
import { jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { resolveOfferingPrice } from "../_shared/email-dist/pricing.js";
import { buildChargeMetadata } from "../_shared/payments/providers/mock.ts";
import { applyMockSyncEvent } from "../_shared/payments/providers/mock.ts";
import { getPaymentProviderForTenant } from "../_shared/payments/index.ts";
import {
  currentPeriodYmJerusalem,
  renewalIdempotencyKey,
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

    const { data: engagement } = await service
      .from("engagements")
      .select("id, offering_id, person_id, billing_account_id, provider_customer_ref")
      .eq("id", schedule.engagement_id)
      .single();

    const { data: offering } = engagement
      ? await service.from("offerings").select("price_minor, currency, billing_mode").eq("id", engagement.offering_id).single()
      : { data: null };

    const { data: tenant } = await service
      .from("tenants")
      .select("vat_rate, prices_include_vat, currency, payment_provider")
      .eq("id", schedule.tenant_id)
      .single();

    if (!engagement || !offering || !tenant || offering.billing_mode !== "recurring") {
      failed += 1;
      continue;
    }

    const pricing = resolveOfferingPrice(
      { price_minor: offering.price_minor as number },
      {
        vat_rate: Number(tenant.vat_rate ?? 0.17),
        prices_include_vat: tenant.prices_include_vat !== false,
      },
    );

    const billingAccountId =
      (schedule.billing_account_id as string | null) ??
      (engagement.billing_account_id as string | null);
    if (!billingAccountId) {
      failed += 1;
      continue;
    }

    // Grow renewals charge a saved card token server-to-server; load the account's default
    // token so the provider can use createTransactionWithToken instead of a hosted page.
    let savedToken: string | undefined;
    if (tenant.payment_provider === "grow") {
      const { data: tokenRow } = await service
        .from("payment_method_tokens")
        .select("provider_token")
        .eq("billing_account_id", billingAccountId)
        .is("revoked_at", null)
        .eq("is_default", true)
        .maybeSingle();
      savedToken = (tokenRow?.provider_token as string | null) ?? undefined;
      if (!savedToken) {
        failed += 1;
        await service
          .from("billing_schedules")
          .update({ last_error: "No saved Grow card token", last_attempt_at: new Date().toISOString() })
          .eq("id", schedule.id);
        continue;
      }
    }

    const provider = await getPaymentProviderForTenant(service, schedule.tenant_id as string);
    const metadata = buildChargeMetadata({
      tenantId: schedule.tenant_id as string,
      engagementId: engagement.id as string,
      billingAccountId,
      offeringId: engagement.offering_id as string,
      personId: engagement.person_id as string,
      vatRate: pricing.vatRate,
      pretaxMinor: pricing.pretaxMinor,
      vatMinor: pricing.vatMinor,
      totalMinor: pricing.totalMinor,
      chargeType: "renewal",
      billingScheduleId: schedule.id as string,
    });

    try {
      const result = await provider.createCharge({
        amountMinor: pricing.totalMinor,
        currency: (offering.currency ?? tenant.currency ?? "ILS").toUpperCase(),
        idempotencyKey: renewalIdempotencyKey(engagement.id as string, periodYm),
        metadata,
        customerRef: (engagement.provider_customer_ref as string | null) ?? undefined,
        savedToken,
      });

      if (result.emitSyncEvent) {
        await applyMockSyncEvent(service, result.emitSyncEvent);
      }

      charged += 1;
    } catch (err) {
      failed += 1;
      const attemptCount = (schedule.attempt_count as number) + 1;
      const updates: Record<string, unknown> = {
        attempt_count: attemptCount,
        last_attempt_at: new Date().toISOString(),
        last_error: err instanceof Error ? err.message : "Charge failed",
      };

      if (attemptCount >= 3) {
        updates.status = "suspended";
        updates.next_attempt_at = null;
        await service
          .from("engagements")
          .update({ billing_status: "suspended" })
          .eq("id", engagement.id);
      } else {
        const { dunningNextAttemptAt } = await import("../_shared/payments/billing-time.ts");
        updates.next_attempt_at = dunningNextAttemptAt(attemptCount);
      }

      await service.from("billing_schedules").update(updates).eq("id", schedule.id);
    }
  }

  return jsonResponse({ ok: true, processed, charged, failed });
});
