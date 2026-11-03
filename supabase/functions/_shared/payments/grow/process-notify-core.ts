import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { auditPaymentFailed } from "../payment-audit.ts";
import {
  GrowWebhookKeyError,
  parseGrowNotify,
  type ParsedGrowNotify,
  verifyGrowWebhookKey,
} from "../providers/grow.ts";
import { peekGrowTenantId } from "./metadata.ts";
import { type GrowPaymentRow, loadGrowPaymentByRef } from "./pending-charge.ts";

export type GrowNotifyResult =
  | { status: "succeeded"; paymentId: string; duplicate: boolean }
  | { status: "failed"; paymentId: string; duplicate: boolean }
  | { status: "rejected"; httpStatus: 400 | 401; reason: string }
  | { status: "amount_mismatch"; paymentId: string; reason: string }
  | { status: "unverified"; paymentId?: string; reason: string };

/**
 * What the notify needs from outside: Grow's approve call and card-token store (the provider),
 * plus the settle and dunning steps. Injected so this core imports no email or finalise code
 * (keeps it light for Deno tests); `process-notify.ts` wires the real ones.
 */
export interface GrowNotifyDeps {
  approveTransaction(tenantId: string, parsed: ParsedGrowNotify): Promise<void>;
  persistCardToken(
    metadata: ParsedGrowNotify["event"]["metadata"],
    body: Record<string, unknown>,
  ): Promise<void>;
  /** Finalise the enrolment or job request for a payment that is now `succeeded`. */
  settle(service: SupabaseClient, row: GrowPaymentRow, parsed: ParsedGrowNotify): Promise<void>;
  /** Record a failed renewal on its billing schedule (dunning). */
  renewalFailed(
    service: SupabaseClient,
    params: { billingScheduleId: string; failureMessage: string },
  ): Promise<unknown>;
}

async function auditRejected(
  service: SupabaseClient,
  tenantId: string,
  entityId: string | null,
  action: string,
  afterState: Record<string, unknown>,
): Promise<void> {
  await service.from("audit_log").insert({
    tenant_id: tenantId,
    action,
    entity_type: "payment",
    entity_id: entityId,
    after_state: { provider: "grow", ...afterState },
  });
}

/**
 * Grow payment notify (server-to-server). Every step fails closed:
 *
 *   1. webhook key: the tenant must have a stored key and the notice must carry it;
 *   2. pending row: the notice must name a Grow payment we created, for the same tenant,
 *      engagement and billing account;
 *   3. amount: the notified `sum` must equal what we charged;
 *   4. approve: Grow's approveTransaction must answer `status: 1`;
 *   5. only then is the row moved `pending → succeeded` and the enrolment/request settled.
 *
 * Idempotent: a replay of a settled notice re-runs the idempotent settle step without calling
 * Grow again; a notice that fails any check leaves the row untouched (still `pending`).
 */
export async function processGrowNotifyWith(
  service: SupabaseClient,
  rawBody: string,
  deps: GrowNotifyDeps,
): Promise<GrowNotifyResult> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { status: "rejected", httpStatus: 400, reason: "Grow notify is not JSON" };
  }

  const tenantId = peekGrowTenantId(body);
  if (!tenantId) {
    return { status: "rejected", httpStatus: 400, reason: "Grow notify missing tenant" };
  }

  try {
    await verifyGrowWebhookKey(service, tenantId, body);
  } catch (err) {
    if (err instanceof GrowWebhookKeyError) {
      await auditRejected(service, tenantId, null, "payment.webhook_rejected", {
        reason: err.message,
      });
      return { status: "rejected", httpStatus: 401, reason: err.message };
    }
    throw err;
  }

  let parsed: ParsedGrowNotify;
  try {
    parsed = parseGrowNotify(body);
  } catch (err) {
    return {
      status: "rejected",
      httpStatus: 400,
      reason: err instanceof Error ? err.message : "Grow notify could not be read",
    };
  }
  const { event } = parsed;
  const ref = event.providerPaymentRef;

  const row = await loadGrowPaymentByRef(service, ref);
  if (
    !row ||
    row.provider !== "grow" ||
    row.tenant_id !== tenantId ||
    row.engagement_id !== event.metadata.engagement_id ||
    row.billing_account_id !== event.metadata.billing_account_id
  ) {
    const reason = row
      ? "Grow notify does not match the payment we created"
      : `no Grow payment found for ${ref}`;
    await auditRejected(service, tenantId, row?.id ?? null, "payment.unverified_callback", {
      provider_payment_ref: ref,
      reason,
    });
    return { status: "unverified", paymentId: row?.id, reason };
  }

  if (event.type === "payment.failed") {
    if (row.status !== "pending") {
      // A late or replayed decline never undoes a settled payment.
      return { status: "failed", paymentId: row.id, duplicate: true };
    }
    await service.from("payments").update({ status: "failed" }).eq("id", row.id).eq("status", "pending");
    if (row.charge_type === "renewal" && event.metadata.billing_schedule_id) {
      await deps.renewalFailed(service, {
        billingScheduleId: event.metadata.billing_schedule_id,
        failureMessage: event.failureMessage ?? "Payment failed",
      });
    }
    await auditPaymentFailed(service, {
      tenantId,
      entityId: row.engagement_id ?? row.id,
      afterState: {
        provider_payment_ref: ref,
        message: event.failureMessage ?? null,
        engagement_id: row.engagement_id ?? "",
        payment_id: row.id,
      },
    });
    return { status: "failed", paymentId: row.id, duplicate: false };
  }

  // The amount must come from the notice itself, never from our own custom fields.
  const data = (body.data as Record<string, unknown> | undefined) ?? body;
  if (data.sum == null || event.amountMinor !== row.total_amount_minor) {
    const reason = `notified sum ${data.sum ?? "(missing)"} does not match expected ${row.total_amount_minor}`;
    await auditRejected(service, tenantId, row.id, "payment.amount_mismatch", {
      expected_minor: row.total_amount_minor,
      callback_minor: data.sum == null ? null : event.amountMinor,
      provider_payment_ref: ref,
    });
    return { status: "amount_mismatch", paymentId: row.id, reason };
  }

  if (row.status === "succeeded") {
    // Replay: no second approve, no second token; settle is idempotent (recovers a crash).
    await deps.settle(service, row, parsed);
    return { status: "succeeded", paymentId: row.id, duplicate: true };
  }
  if (row.status !== "pending") {
    // failed/refunded rows never settle from a late notice.
    return { status: "unverified", paymentId: row.id, reason: `payment is ${row.status}` };
  }

  try {
    await deps.approveTransaction(tenantId, parsed);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "approveTransaction failed";
    await auditRejected(service, tenantId, row.id, "payment.unverified_callback", {
      provider_payment_ref: ref,
      reason,
    });
    return { status: "unverified", paymentId: row.id, reason };
  }

  const { data: upgraded, error: upgradeError } = await service
    .from("payments")
    .update({
      status: "succeeded",
      paid_at: new Date().toISOString(),
      // Grow's own transaction id: refundTransaction needs it, not our reference.
      // (parseGrowNotify falls back to our reference when Grow sends none: don't store that.)
      provider_transaction_id: parsed.transactionId && parsed.transactionId !== ref ? parsed.transactionId : null,
      // Grow's refundTransaction also needs the transaction token from this notice.
      provider_transaction_token: parsed.transactionToken ?? null,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (upgradeError) throw upgradeError;
  if (!upgraded) {
    // Lost the race with a concurrent replay — that replay settles.
    return { status: "succeeded", paymentId: row.id, duplicate: true };
  }

  await deps.persistCardToken(event.metadata, body);
  await deps.settle(service, row, parsed);

  return { status: "succeeded", paymentId: row.id, duplicate: false };
}
