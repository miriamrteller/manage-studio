import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { ensureBillingAccountForStudent } from "../ensure-billing-account.ts";
import { getPaymentProviderForTenant } from "../payments/index.ts";
import type { ChargeMetadata } from "../payments/types.ts";
import { tenantBaseUrlFor } from "../tenant-url.ts";
import type { JobPaymentRequestRow } from "./load-request.ts";
import { isCollectable } from "./payment-request-state.ts";

export type CreateRequestChargeResult =
  | { ok: true; pageUrl: string; providerPaymentRef: string; paymentId: string | null }
  | { ok: false; error: string; status: number };

/**
 * Create a hosted-page charge (YPay) for a job payment request.
 *
 * Amount is the request's amount_minor — NEVER offerings.price_minor (the
 * shoot's price lives on the requests). Gross pricing: pretax/VAT fields are 0
 * and the provider's bundled tax document carries the VAT breakdown.
 *
 * The provider inserts the pending payments row (D5); we then tag it with
 * job_payment_request_id so the callback can settle the request. Several
 * pending charges may exist for one request (client reopened the link) — only
 * one can succeed into `payment_id`; a second success is flagged as a
 * duplicate by markJobPaymentRequestPaid.
 */
export async function createJobPaymentRequestCharge(
  service: SupabaseClient,
  request: JobPaymentRequestRow,
  options: { tenantLabel?: string } = {},
): Promise<CreateRequestChargeResult> {
  if (!isCollectable(request.status)) {
    return { ok: false, error: `Request is ${request.status}`, status: 409 };
  }

  const { data: engagement, error: engagementError } = await service
    .from("engagements")
    .select("id, tenant_id, person_id, offering_id, billing_account_id, status")
    .eq("id", request.engagement_id)
    .single();
  if (engagementError || !engagement || engagement.tenant_id !== request.tenant_id) {
    return { ok: false, error: "Job not found", status: 404 };
  }
  if (engagement.status === "cancelled" || engagement.status === "withdrawn") {
    return { ok: false, error: "Job is cancelled", status: 409 };
  }

  let billingAccountId = engagement.billing_account_id as string | null;
  if (!billingAccountId) {
    billingAccountId = await ensureBillingAccountForStudent(
      service,
      request.tenant_id,
      engagement.person_id as string,
    );
    await service
      .from("engagements")
      .update({ billing_account_id: billingAccountId })
      .eq("id", engagement.id)
      .is("billing_account_id", null);
  }

  const metadata: ChargeMetadata = {
    tenant_id: request.tenant_id,
    engagement_id: request.engagement_id,
    billing_account_id: billingAccountId,
    charge_type: "initial",
    offering_id: (engagement.offering_id as string | null) ?? undefined,
    person_id: engagement.person_id as string,
    vat_rate: "0",
    pretax_amount_minor: "0",
    vat_amount_minor: "0",
    total_amount_minor: String(request.amount_minor),
  };

  const base = await tenantBaseUrlFor(service, request.tenant_id);
  const payUrl = `${base}/pay/${encodeURIComponent(request.public_token)}`;

  const provider = await getPaymentProviderForTenant(service, request.tenant_id);
  const result = await provider.createCharge({
    amountMinor: request.amount_minor,
    currency: request.currency,
    idempotencyKey: `jpr_${request.id}_${Date.now()}`,
    metadata,
    installments: request.max_installments > 1 ? request.max_installments : undefined,
    lineItem: {
      name: request.label,
      description: options.tenantLabel ? `${options.tenantLabel} — ${request.label}` : request.label,
    },
    returnUrls: {
      success: `${payUrl}?result=success`,
      failure: `${payUrl}?result=failed`,
    },
  });

  if (!result.pageUrl) {
    return {
      ok: false,
      error: `Payment provider ${provider.slug} did not return a hosted page URL`,
      status: 502,
    };
  }

  // Tag the pending row the provider inserted so the callback can settle the request.
  const { data: tagged } = await service
    .from("payments")
    .update({ job_payment_request_id: request.id })
    .eq("provider_payment_ref", result.providerPaymentRef)
    .eq("tenant_id", request.tenant_id)
    .select("id")
    .maybeSingle();

  await service.from("audit_log").insert({
    tenant_id: request.tenant_id,
    action: "job_payment_request.charge_created",
    entity_type: "job_payment_request",
    entity_id: request.id,
    after_state: {
      provider: provider.slug,
      provider_payment_ref: result.providerPaymentRef,
      payment_id: tagged?.id ?? null,
      amount_minor: request.amount_minor,
      currency: request.currency,
      max_installments: request.max_installments,
    },
  });

  return {
    ok: true,
    pageUrl: result.pageUrl,
    providerPaymentRef: result.providerPaymentRef,
    paymentId: (tagged?.id as string | undefined) ?? null,
  };
}
