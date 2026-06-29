import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { encodeIcountIpnBody } from "./ipn.ts";
import type { ChargeMetadata, ChargeParams, PaymentProvider } from "../types.ts";

export const MOCK_ICOUNT_API_V3_BASE = "https://mock.icount.local/api/v3";

export function buildMockCcBillRequest(params: ChargeParams): Record<string, string | number> {
  const sum = (params.amountMinor / 100).toFixed(2);
  return {
    cc_storage_id: params.savedToken ?? "",
    sum: parseFloat(sum),
    currency_code: params.currency.toUpperCase(),
    description: "OpalSwift renewal",
    tenant_id: params.metadata.tenant_id,
    engagement_id: params.metadata.engagement_id,
    billing_schedule_id: params.metadata.billing_schedule_id ?? "",
    charge_type: params.metadata.charge_type,
    offering_id: params.metadata.offering_id ?? "",
    person_id: params.metadata.person_id ?? "",
    billing_account_id: params.metadata.billing_account_id,
    total_amount_minor: params.metadata.total_amount_minor ?? String(params.amountMinor),
  };
}

export function parseMockCcBillResponse(
  json: unknown,
): { confirmationCode: string; doctype?: string; docnum?: number } {
  const body = json as Record<string, unknown>;
  if (body.status !== true) {
    const errMsg = typeof body.error === "string" ? body.error : "Mock cc/bill declined";
    throw new Error(errMsg);
  }
  const confirmationCode = String(body.confirmation_code ?? "").trim();
  if (!confirmationCode) {
    throw new Error("Mock cc/bill response missing confirmation_code");
  }
  return {
    confirmationCode,
    doctype: body.doctype != null ? String(body.doctype) : undefined,
    docnum: typeof body.docnum === "number" ? body.docnum : undefined,
  };
}

export function buildMockIpnFromCharge(params: {
  providerPaymentRef: string;
  amountMinor: number;
  currency: string;
  metadata: ChargeMetadata;
  cp?: number;
  doctype?: string;
  docnum?: number;
}): string {
  const sum = (params.amountMinor / 100).toFixed(2);
  return encodeIcountIpnBody({
    cp: params.cp ?? 12345,
    sum: parseFloat(sum),
    currency_code: params.currency.toUpperCase(),
    confirmation_code: params.providerPaymentRef,
    doctype: params.doctype ?? "invrec",
    docnum: params.docnum ?? 3006,
    num_of_payments: 1,
    tenant_id: params.metadata.tenant_id,
    engagement_id: params.metadata.engagement_id,
    billing_account_id: params.metadata.billing_account_id,
    charge_type: params.metadata.charge_type,
    billing_schedule_id: params.metadata.billing_schedule_id,
    offering_id: params.metadata.offering_id,
    person_id: params.metadata.person_id,
    vat_rate: params.metadata.vat_rate,
    pretax_amount_minor: params.metadata.pretax_amount_minor,
    vat_amount_minor: params.metadata.vat_amount_minor,
    total_amount_minor: params.metadata.total_amount_minor ?? String(params.amountMinor),
  });
}

/** Inline mock IPN delivery for ICOUNT_MOCK renewals — exercises constructEvent → handlePaymentEventInternal. */
export async function deliverMockIcountIpn(
  service: SupabaseClient,
  provider: PaymentProvider,
  params: {
    providerPaymentRef: string;
    amountMinor: number;
    currency: string;
    metadata: ChargeMetadata;
    tenantId: string;
  },
): Promise<void> {
  const ipnBody = buildMockIpnFromCharge(params);
  const headers = new Headers({ "x-mock-signature": "mock-valid" });
  const event = await provider.constructEvent(ipnBody, headers, params.tenantId);
  const { handlePaymentEventInternal } = await import("../handle-payment-event.ts");
  await handlePaymentEventInternal(service, event, "icount");
}
