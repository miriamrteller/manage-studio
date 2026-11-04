import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { auditPaymentPendingCreated } from "../payment-audit.ts";
import type { ChargeMetadata } from "../types.ts";

/**
 * The payment row exists before the client opens Takbull's page, so the notice settles a row
 * we already know (and its amount is ours, not the notice's). Its provider_payment_ref moves:
 *   1. `takbull_new_<uuid>` while the order is being created;
 *   2. Takbull's order `uniqId` once GetTakbullPaymentPageRedirectUrl answers (callers that tag
 *      the row afterwards, e.g. project payment requests, find it by this);
 *   3. Takbull's `transactionInternalNumber` once the payment settles (refunds need it).
 * Our payment id is sent as `order_reference`, so a notice can always be matched to this row.
 */
export interface TakbullPaymentRow {
  id: string;
  tenant_id: string;
  engagement_id: string | null;
  billing_account_id: string | null;
  charge_type: string;
  status: string;
  provider_payment_ref: string;
  total_amount_minor: number;
  pretax_amount_minor: number;
  vat_amount_minor: number;
  vat_rate: number;
  currency: string;
  person_id: string | null;
  offering_id: string | null;
  job_payment_request_id: string | null;
}

const ROW_COLUMNS =
  "id, tenant_id, engagement_id, billing_account_id, charge_type, status, provider_payment_ref, total_amount_minor, pretax_amount_minor, vat_amount_minor, vat_rate, currency, person_id, offering_id, job_payment_request_id";

export async function insertPendingTakbullPayment(
  service: SupabaseClient,
  params: { amountMinor: number; currency: string; metadata: ChargeMetadata; saveCard: boolean },
): Promise<{ paymentId: string; ref: string }> {
  const { metadata, amountMinor, currency } = params;

  const { data: engagement, error: engError } = await service
    .from("engagements")
    .select("id, person_id, offering_id")
    .eq("id", metadata.engagement_id)
    .single();
  if (engError || !engagement) {
    throw new Error(`Engagement not found for pending Takbull payment: ${metadata.engagement_id}`);
  }
  const { data: person } = await service
    .from("people")
    .select("account_id")
    .eq("id", engagement.person_id)
    .single();

  const ref = `takbull_new_${crypto.randomUUID()}`;
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
      provider: "takbull",
      provider_payment_ref: ref,
      payment_method: "card",
      pretax_amount_minor: Number(metadata.pretax_amount_minor ?? 0),
      vat_rate: Number(metadata.vat_rate ?? 0),
      vat_amount_minor: Number(metadata.vat_amount_minor ?? 0),
      total_amount_minor: amountMinor,
      currency: currency.toUpperCase(),
      status: "pending",
      description: `${metadata.charge_type} payment ${metadata.engagement_id} (pending Takbull)`,
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw insertError ?? new Error("Pending Takbull payment insert failed");

  const paymentId = inserted.id as string;
  const { error: orderError } = await service.from("takbull_orders").insert({
    payment_id: paymentId,
    tenant_id: metadata.tenant_id,
    metadata,
    save_card: params.saveCard,
  });
  if (orderError) throw orderError;
  await auditPaymentPendingCreated(service, {
    tenantId: metadata.tenant_id,
    paymentId,
    providerPaymentRef: ref,
    engagementId: metadata.engagement_id,
    chargeType: metadata.charge_type,
    provider: "takbull",
    amountMinor,
    currency: currency.toUpperCase(),
  });
  return { paymentId, ref };
}

export interface TakbullOrderRow {
  payment_id: string;
  tenant_id: string;
  uniq_id: string | null;
  metadata: ChargeMetadata;
  save_card: boolean;
}

export async function loadTakbullOrder(service: SupabaseClient, paymentId: string): Promise<TakbullOrderRow | null> {
  const { data, error } = await service
    .from("takbull_orders")
    .select("payment_id, tenant_id, uniq_id, metadata, save_card")
    .eq("payment_id", paymentId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as TakbullOrderRow | null;
}

/** Takbull answered with its order id: the payment and the order both carry it from now on. */
export async function setTakbullOrderRef(service: SupabaseClient, paymentId: string, uniqId: string): Promise<void> {
  const { error } = await service
    .from("payments")
    .update({ provider_payment_ref: uniqId })
    .eq("id", paymentId)
    .eq("status", "pending");
  if (error) throw error;
  const { error: orderError } = await service.from("takbull_orders").update({ uniq_id: uniqId }).eq("payment_id", paymentId);
  if (orderError) throw orderError;
}

export async function markTakbullOrderFailed(service: SupabaseClient, paymentId: string): Promise<void> {
  await service.from("payments").update({ status: "failed" }).eq("id", paymentId).eq("status", "pending");
}

/** The Takbull payment for a notice: by our id (order_reference), checked against Takbull's ids. */
export async function loadTakbullPayment(
  service: SupabaseClient,
  params: { orderReference?: string | null; uniqId?: string | null; transactionInternalNumber?: string | null },
): Promise<TakbullPaymentRow | null> {
  if (params.orderReference && /^[0-9a-f-]{36}$/i.test(params.orderReference)) {
    const { data, error } = await service
      .from("payments")
      .select(ROW_COLUMNS)
      .eq("id", params.orderReference)
      .eq("provider", "takbull")
      .maybeSingle();
    if (error) throw error;
    if (data) return data as TakbullPaymentRow;
  }
  for (const ref of [params.uniqId, params.transactionInternalNumber]) {
    if (!ref) continue;
    const { data, error } = await service
      .from("payments")
      .select(ROW_COLUMNS)
      .eq("provider_payment_ref", ref)
      .eq("provider", "takbull")
      .maybeSingle();
    if (error) throw error;
    if (data) return data as TakbullPaymentRow;
  }
  return null;
}
