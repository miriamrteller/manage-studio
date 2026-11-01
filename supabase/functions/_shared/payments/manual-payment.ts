/**
 * Manual (offline) payments: cash / bank transfer taken by the studio itself.
 *
 * Two rows can describe one offline payment:
 *   1. a *request* — the parent chose "pay at the studio" on the public checkout
 *      (status 'pending', provider 'manual'); and
 *   2. the *record* — a tenant admin confirms the money arrived (status 'succeeded').
 * recordManualPayment() completes the pending request when there is one instead of
 * inserting a second row, so finance never shows a stale "pending" next to the paid row.
 *
 * Deterministic money code: no AI, no provider calls. The human actor is stored on the
 * row (created_by / approved_by) and the caller audits the action (finalisePayment).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

export const MANUAL_PAYMENT_PROVIDER = "manual";
export const OFFLINE_PAYMENT_REQUESTED = "payment.offline_requested";

export type OfflinePaymentMethod = "cash" | "bank_transfer";

export const OFFLINE_PAYMENT_METHODS: readonly OfflinePaymentMethod[] = ["cash", "bank_transfer"];

export function isOfflinePaymentMethod(value: unknown): value is OfflinePaymentMethod {
  return value === "cash" || value === "bank_transfer";
}

/** One request per engagement: a second click updates the method instead of adding a row. */
export function offlineRequestPaymentRef(engagementId: string): string {
  return `offline_request_${engagementId}`;
}

export interface ManualPaymentTarget {
  tenantId: string;
  engagementId: string;
  personId: string;
  accountId: string | null;
  offeringId: string;
  billingAccountId: string;
  totalMinor: number;
  currency: string;
}

/** Row written when the parent asks to pay at the studio (nothing has been paid yet). */
export function buildOfflineRequestRow(
  target: ManualPaymentTarget,
  method: OfflinePaymentMethod,
) {
  return {
    tenant_id: target.tenantId,
    account_id: target.accountId,
    person_id: target.personId,
    offering_id: target.offeringId,
    engagement_id: target.engagementId,
    billing_account_id: target.billingAccountId,
    charge_type: "initial" as const,
    provider: MANUAL_PAYMENT_PROVIDER,
    provider_payment_ref: offlineRequestPaymentRef(target.engagementId),
    payment_method: method,
    pretax_amount_minor: 0,
    vat_rate: 0,
    vat_amount_minor: 0,
    total_amount_minor: target.totalMinor,
    currency: target.currency.toUpperCase(),
    status: "pending" as const,
    description: `Offline payment requested at checkout (${method})`,
  };
}

/** Row written when a tenant admin records that the money arrived. */
export function buildManualPaymentRow(
  target: ManualPaymentTarget,
  input: { method: OfflinePaymentMethod; note?: string; actorUserId: string; paidAt: string },
) {
  return {
    tenant_id: target.tenantId,
    account_id: target.accountId,
    person_id: target.personId,
    offering_id: target.offeringId,
    engagement_id: target.engagementId,
    billing_account_id: target.billingAccountId,
    charge_type: "initial" as const,
    provider: MANUAL_PAYMENT_PROVIDER,
    provider_payment_ref: `manual_${target.engagementId}_${Date.parse(input.paidAt)}`,
    payment_method: input.method,
    pretax_amount_minor: 0,
    vat_rate: 0,
    vat_amount_minor: 0,
    total_amount_minor: target.totalMinor,
    currency: target.currency.toUpperCase(),
    status: "succeeded" as const,
    paid_at: input.paidAt,
    description: input.note ?? `Manual ${input.method} payment`,
    created_by: input.actorUserId,
    approved_by: input.actorUserId,
  };
}

/** Fields that turn a pending offline request into the paid record. */
export function buildManualPaymentCompletion(input: {
  method: OfflinePaymentMethod;
  note?: string;
  actorUserId: string;
  paidAt: string;
  totalMinor: number;
}) {
  return {
    status: "succeeded" as const,
    payment_method: input.method,
    total_amount_minor: input.totalMinor,
    paid_at: input.paidAt,
    description: input.note ?? `Manual ${input.method} payment`,
    created_by: input.actorUserId,
    approved_by: input.actorUserId,
  };
}

export async function findPendingOfflineRequest(
  service: SupabaseClient,
  tenantId: string,
  engagementId: string,
): Promise<{ id: string; payment_method: string | null } | null> {
  const { data } = await service
    .from("payments")
    .select("id, payment_method")
    .eq("tenant_id", tenantId)
    .eq("engagement_id", engagementId)
    .eq("provider", MANUAL_PAYMENT_PROVIDER)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; payment_method: string | null } | null) ?? null;
}

export type ManualPaymentRowRef = { id: string; engagement_id: string | null; charge_type: string };

/**
 * Insert the paid row, or complete the parent's pending offline request if one exists.
 * Returns the row finalisePayment() needs.
 */
export async function recordManualPayment(
  service: SupabaseClient,
  target: ManualPaymentTarget,
  input: { method: OfflinePaymentMethod; note?: string; actorUserId: string },
): Promise<{ ok: true; row: ManualPaymentRowRef; completedRequest: boolean } | { ok: false; error: string }> {
  const paidAt = new Date().toISOString();
  const pending = await findPendingOfflineRequest(service, target.tenantId, target.engagementId);

  if (pending) {
    const { data, error } = await service
      .from("payments")
      .update(buildManualPaymentCompletion({ ...input, paidAt, totalMinor: target.totalMinor }))
      .eq("id", pending.id)
      .eq("status", "pending")
      .select("id, engagement_id, charge_type")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (data) return { ok: true, row: data as ManualPaymentRowRef, completedRequest: true };
    // Lost a race with another admin click; fall through and insert normally.
  }

  const { data, error } = await service
    .from("payments")
    .insert(buildManualPaymentRow(target, { ...input, paidAt }))
    .select("id, engagement_id, charge_type")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Insert failed" };
  return { ok: true, row: data as ManualPaymentRowRef, completedRequest: false };
}
