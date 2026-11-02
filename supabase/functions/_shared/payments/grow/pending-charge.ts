import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { auditPaymentPendingCreated } from "../payment-audit.ts";
import type { ChargeMetadata } from "../types.ts";

/**
 * Insert a pending payment row before calling Grow (D5, same shape as Invoice4U/YPay).
 * `provider_payment_ref` = the `transactionUniqueIdentifier` we send to Grow, which Grow
 * echoes on the notify. The notify handler compares tenant, engagement and amount against
 * this row, so what Grow tells us is checked against what we asked for.
 *
 * Checkout and renewal keys are deterministic, so a retry reuses the existing row: a
 * `pending` row is reused as is, a `failed` one goes back to `pending`, and a settled one
 * refuses a second charge.
 */
export async function insertPendingGrowPayment(
  service: SupabaseClient,
  params: {
    transactionUniqueIdentifier: string;
    amountMinor: number;
    currency: string;
    metadata: ChargeMetadata;
  },
): Promise<{ paymentId: string }> {
  const { metadata, transactionUniqueIdentifier: ref, amountMinor, currency } = params;

  const existing = await loadGrowPaymentByRef(service, ref);
  if (existing) {
    if (
      existing.provider !== "grow" ||
      existing.tenant_id !== metadata.tenant_id ||
      existing.engagement_id !== metadata.engagement_id ||
      existing.total_amount_minor !== amountMinor
    ) {
      throw new Error(`Grow payment reference ${ref} already belongs to a different charge`);
    }
    if (existing.status === "pending") return { paymentId: existing.id };
    if (existing.status === "failed") {
      const { error } = await service
        .from("payments")
        .update({ status: "pending" })
        .eq("id", existing.id)
        .eq("status", "failed");
      if (error) throw error;
      return { paymentId: existing.id };
    }
    throw new Error(`Grow payment ${ref} is already ${existing.status}`);
  }

  const { data: engagement, error: engError } = await service
    .from("engagements")
    .select("id, tenant_id, person_id, offering_id")
    .eq("id", metadata.engagement_id)
    .single();

  if (engError || !engagement || engagement.tenant_id !== metadata.tenant_id) {
    throw new Error(`Engagement not found for pending Grow payment: ${metadata.engagement_id}`);
  }

  const { data: person } = await service
    .from("people")
    .select("account_id")
    .eq("id", engagement.person_id)
    .single();

  const { data: inserted, error: insertError } = await service
    .from("payments")
    .insert({
      tenant_id: metadata.tenant_id,
      account_id: person?.account_id ?? null,
      person_id: metadata.person_id ?? engagement.person_id,
      offering_id: metadata.offering_id ?? engagement.offering_id,
      engagement_id: metadata.engagement_id,
      billing_account_id: metadata.billing_account_id,
      charge_type: metadata.charge_type,
      provider: "grow",
      provider_payment_ref: ref,
      payment_method: "card",
      pretax_amount_minor: Number(metadata.pretax_amount_minor ?? 0),
      vat_rate: Number(metadata.vat_rate ?? 0),
      vat_amount_minor: Number(metadata.vat_amount_minor ?? 0),
      total_amount_minor: amountMinor,
      currency: currency.toUpperCase(),
      status: "pending",
      description: `${metadata.charge_type} payment ${metadata.engagement_id} (pending Grow ref=${ref})`,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw insertError ?? new Error("Pending Grow payment insert failed");
  }

  const paymentId = inserted.id as string;
  await auditPaymentPendingCreated(service, {
    tenantId: metadata.tenant_id,
    paymentId,
    providerPaymentRef: ref,
    engagementId: metadata.engagement_id,
    chargeType: metadata.charge_type,
    provider: "grow",
    amountMinor,
    currency: currency.toUpperCase(),
  });

  return { paymentId };
}

/** Mark a pending row failed when Grow refused to start the charge (no notify will follow). */
export async function markPendingGrowPaymentFailed(
  service: SupabaseClient,
  paymentId: string,
): Promise<void> {
  await service.from("payments").update({ status: "failed" }).eq("id", paymentId).eq("status", "pending");
}

export interface GrowPaymentRow {
  id: string;
  tenant_id: string;
  provider: string;
  engagement_id: string | null;
  billing_account_id: string | null;
  charge_type: string;
  status: string;
  total_amount_minor: number;
  currency: string;
  /** Set when the charge was created for a photographer deposit/balance request. */
  job_payment_request_id: string | null;
}

/** Load the payment row a Grow notify refers to, by our transactionUniqueIdentifier. */
export async function loadGrowPaymentByRef(
  service: SupabaseClient,
  providerPaymentRef: string,
): Promise<GrowPaymentRow | null> {
  const { data, error } = await service
    .from("payments")
    .select(
      "id, tenant_id, provider, engagement_id, billing_account_id, charge_type, status, total_amount_minor, currency, job_payment_request_id",
    )
    .eq("provider_payment_ref", providerPaymentRef)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as GrowPaymentRow | null;
}
