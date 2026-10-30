import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { loadJobPaymentRequestById } from "./load-request.ts";
import { canTransition } from "./payment-request-state.ts";

export const JOB_PAYMENT_REQUEST_PAID = "job_payment_request.paid";
export const JOB_PAYMENT_REQUEST_DUPLICATE_PAYMENT = "job_payment_request.duplicate_payment";

export type MarkRequestPaidResult =
  | { outcome: "paid" }
  | { outcome: "already_paid_same_payment" }
  /** Money was collected twice for one request — needs a manual refund. */
  | { outcome: "duplicate_payment"; settledByPaymentId: string }
  | { outcome: "request_not_found" }
  | { outcome: "not_collectable"; status: string }
  | { outcome: "concurrent_update" };

/**
 * Settle a job payment request with a succeeded payment. Idempotent:
 *  - same payment again → no-op.
 *  - a DIFFERENT succeeded payment for an already-paid request is still
 *    recorded (the money really moved) but the request keeps its first
 *    settlement and an audit row flags the double charge for a manual refund.
 *
 * Caller guarantees the payments row is already `succeeded`.
 */
export async function markJobPaymentRequestPaid(
  service: SupabaseClient,
  params: {
    requestId: string;
    paymentId: string;
    actorUserId?: string | null;
    /** 'card' for provider charges; 'cash' | 'bank_transfer' for manual. */
    method: string;
  },
): Promise<MarkRequestPaidResult> {
  const request = await loadJobPaymentRequestById(service, params.requestId);
  if (!request) return { outcome: "request_not_found" };

  if (request.status === "paid" || request.status === "refunded_manual") {
    if (request.payment_id === params.paymentId) {
      return { outcome: "already_paid_same_payment" };
    }
    const { data: dupAudit } = await service
      .from("audit_log")
      .select("id")
      .eq("tenant_id", request.tenant_id)
      .eq("action", JOB_PAYMENT_REQUEST_DUPLICATE_PAYMENT)
      .eq("entity_id", request.id)
      .filter("after_state->>payment_id", "eq", params.paymentId)
      .limit(1)
      .maybeSingle();
    if (!dupAudit) {
      await service.from("audit_log").insert({
        tenant_id: request.tenant_id,
        action: JOB_PAYMENT_REQUEST_DUPLICATE_PAYMENT,
        entity_type: "job_payment_request",
        entity_id: request.id,
        actor_id: params.actorUserId ?? null,
        after_state: {
          payment_id: params.paymentId,
          settled_by_payment_id: request.payment_id,
          engagement_id: request.engagement_id,
          amount_minor: request.amount_minor,
          note: "Second successful payment for an already-paid request — refund manually.",
        },
      });
    }
    return { outcome: "duplicate_payment", settledByPaymentId: request.payment_id ?? "" };
  }

  const event = params.method === "card" ? "payment_succeeded" : "mark_paid_manual";
  if (!canTransition(request.status, event)) {
    return { outcome: "not_collectable", status: request.status };
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await service
    .from("job_payment_requests")
    .update({ status: "paid", payment_id: params.paymentId, paid_at: now })
    .eq("id", request.id)
    .in("status", ["pending", "sent"])
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!updated) return { outcome: "concurrent_update" };

  await service.from("audit_log").insert({
    tenant_id: request.tenant_id,
    action: JOB_PAYMENT_REQUEST_PAID,
    entity_type: "job_payment_request",
    entity_id: request.id,
    actor_id: params.actorUserId ?? null,
    after_state: {
      payment_id: params.paymentId,
      engagement_id: request.engagement_id,
      amount_minor: request.amount_minor,
      currency: request.currency,
      method: params.method,
      label: request.label,
    },
  });

  return { outcome: "paid" };
}
