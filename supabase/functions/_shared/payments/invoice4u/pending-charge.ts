import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import type { ChargeMetadata } from "../types.ts";

/**
 * Insert a pending payment intent row before hosted redirect (SPIKE-ADR D5).
 * `provider_payment_ref` = OrderIdClientUsage until success upgrades to PaymentId (D12).
 */
export async function insertPendingInvoice4uPayment(
  service: SupabaseClient,
  params: {
    orderId: string;
    amountMinor: number;
    currency: string;
    metadata: ChargeMetadata;
  },
): Promise<{ paymentId: string }> {
  const { metadata, orderId, amountMinor, currency } = params;

  const { data: engagement, error: engError } = await service
    .from("engagements")
    .select("id, person_id, offering_id, billing_account_id")
    .eq("id", metadata.engagement_id)
    .single();

  if (engError || !engagement) {
    throw new Error(`Engagement not found for pending Invoice4U payment: ${metadata.engagement_id}`);
  }

  const { data: person } = await service
    .from("people")
    .select("account_id")
    .eq("id", engagement.person_id)
    .single();

  const pretax = Number(metadata.pretax_amount_minor ?? 0);
  const vat = Number(metadata.vat_amount_minor ?? 0);
  const vatRate = Number(metadata.vat_rate ?? 0);

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
      provider: "invoice4u",
      provider_payment_ref: orderId,
      payment_method: "card",
      pretax_amount_minor: pretax,
      vat_rate: vatRate,
      vat_amount_minor: vat,
      total_amount_minor: amountMinor,
      currency: currency.toUpperCase(),
      status: "pending",
      description: `${metadata.charge_type} payment ${metadata.engagement_id} (pending OrderIdClientUsage=${orderId})`,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw insertError ?? new Error("Pending Invoice4U payment insert failed");
  }

  return { paymentId: inserted.id as string };
}

/** Load pending (or any) payment by OrderIdClientUsage / provider_payment_ref. */
export async function loadPaymentByProviderRef(
  service: SupabaseClient,
  providerPaymentRef: string,
): Promise<{
  id: string;
  tenant_id: string;
  engagement_id: string | null;
  charge_type: string;
  status: string;
  total_amount_minor: number;
  billing_account_id: string | null;
  person_id: string | null;
  offering_id: string | null;
  pretax_amount_minor: number;
  vat_amount_minor: number;
  vat_rate: number;
  currency: string;
} | null> {
  const { data, error } = await service
    .from("payments")
    .select(
      "id, tenant_id, engagement_id, charge_type, status, total_amount_minor, billing_account_id, person_id, offering_id, pretax_amount_minor, vat_amount_minor, vat_rate, currency",
    )
    .eq("provider_payment_ref", providerPaymentRef)
    .maybeSingle();

  if (error) throw error;
  return data as {
    id: string;
    tenant_id: string;
    engagement_id: string | null;
    charge_type: string;
    status: string;
    total_amount_minor: number;
    billing_account_id: string | null;
    person_id: string | null;
    offering_id: string | null;
    pretax_amount_minor: number;
    vat_amount_minor: number;
    vat_rate: number;
    currency: string;
  } | null;
}
