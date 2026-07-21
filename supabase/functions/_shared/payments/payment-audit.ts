import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export const PAYMENT_PENDING_CREATED = "payment.pending_created";
export const PAYMENT_FAILED = "payment.failed";

export type PaymentFailedAfterState = {
  provider_payment_ref: string;
  message?: string | null;
  engagement_id: string;
  payment_id?: string | null;
  order_id_client_usage?: string | null;
};

/** Normalize payment.failed audit shape across providers. */
export async function auditPaymentFailed(
  service: SupabaseClient,
  params: {
    tenantId: string;
    /** Prefer payment row id when known; otherwise engagement id. */
    entityId: string;
    afterState: PaymentFailedAfterState;
  },
): Promise<void> {
  await service.from("audit_log").insert({
    tenant_id: params.tenantId,
    action: PAYMENT_FAILED,
    entity_type: "payment",
    entity_id: params.entityId,
    after_state: {
      provider_payment_ref: params.afterState.provider_payment_ref,
      message: params.afterState.message ?? null,
      engagement_id: params.afterState.engagement_id,
      ...(params.afterState.payment_id
        ? { payment_id: params.afterState.payment_id }
        : {}),
      ...(params.afterState.order_id_client_usage
        ? { order_id_client_usage: params.afterState.order_id_client_usage }
        : {}),
    },
  });
}

export async function auditPaymentPendingCreated(
  service: SupabaseClient,
  params: {
    tenantId: string;
    paymentId: string;
    providerPaymentRef: string;
    engagementId: string;
    chargeType: string;
    provider: string;
    amountMinor: number;
    currency: string;
  },
): Promise<void> {
  await service.from("audit_log").insert({
    tenant_id: params.tenantId,
    action: PAYMENT_PENDING_CREATED,
    entity_type: "payment",
    entity_id: params.paymentId,
    after_state: {
      provider_payment_ref: params.providerPaymentRef,
      engagement_id: params.engagementId,
      charge_type: params.chargeType,
      provider: params.provider,
      total_amount_minor: params.amountMinor,
      currency: params.currency,
    },
  });
}
