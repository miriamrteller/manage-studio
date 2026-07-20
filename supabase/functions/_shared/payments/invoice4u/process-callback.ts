import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { applyBundledDocumentNotify } from "../bundled-document.ts";
import { finalisePayment } from "../finalise-payment.ts";
import type { ChargeMetadata } from "../types.ts";
import {
  extractInvoice4uCallbackData,
  parseInvoice4uCallback,
  peekInvoice4uOrderId,
} from "./callback.ts";
import { loadPaymentByProviderRef } from "./pending-charge.ts";

export type Invoice4uCallbackResult =
  | { paymentId: string; duplicate: boolean; status: "succeeded" | "failed"; amountMismatch?: false }
  | { paymentId: string; duplicate: false; status: "amount_mismatch"; amountMismatch: true };

function metadataFromPendingRow(row: {
  tenant_id: string;
  engagement_id: string | null;
  charge_type: string;
  billing_account_id: string | null;
  person_id: string | null;
  offering_id: string | null;
  pretax_amount_minor: number;
  vat_amount_minor: number;
  vat_rate: number;
  total_amount_minor: number;
}): ChargeMetadata {
  if (!row.engagement_id || !row.billing_account_id) {
    throw new Error("Pending Invoice4U payment missing engagement or billing account");
  }
  return {
    tenant_id: row.tenant_id,
    engagement_id: row.engagement_id,
    billing_account_id: row.billing_account_id,
    charge_type: row.charge_type === "renewal" ? "renewal" : "initial",
    person_id: row.person_id ?? undefined,
    offering_id: row.offering_id ?? undefined,
    pretax_amount_minor: String(row.pretax_amount_minor),
    vat_amount_minor: String(row.vat_amount_minor),
    vat_rate: String(row.vat_rate),
    total_amount_minor: String(row.total_amount_minor),
  };
}

async function upsertInvoice4uToken(
  service: SupabaseClient,
  params: {
    tenantId: string;
    billingAccountId: string;
    customerId: string;
    cardBrand: string | null;
    cardLast4: string | null;
  },
): Promise<void> {
  const { data: existing } = await service
    .from("payment_method_tokens")
    .select("id")
    .eq("billing_account_id", params.billingAccountId)
    .eq("provider", "invoice4u")
    .eq("provider_token", params.customerId)
    .is("revoked_at", null)
    .maybeSingle();

  if (existing) return;

  await service
    .from("payment_method_tokens")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("billing_account_id", params.billingAccountId)
    .eq("is_default", true)
    .is("revoked_at", null);

  await service.from("payment_method_tokens").insert({
    tenant_id: params.tenantId,
    billing_account_id: params.billingAccountId,
    provider: "invoice4u",
    provider_token: params.customerId,
    card_brand: params.cardBrand,
    last4: params.cardLast4,
    is_default: true,
  });
}

/**
 * Hosted Invoice4U callback path (D5/D12/D15–D19):
 * load pending by OrderId → amount verify → upgrade to PaymentId → finalise → bundled doc.
 */
export async function processInvoice4uPaymentCallback(
  service: SupabaseClient,
  rawBody: string,
): Promise<Invoice4uCallbackResult> {
  const orderId = peekInvoice4uOrderId(rawBody);
  if (!orderId) {
    throw new Error("Invoice4U callback missing OrderIdClientUsage");
  }

  const data = extractInvoice4uCallbackData(rawBody);
  const paymentIdFromCallback = data.PaymentId?.trim() || null;

  let pending = await loadPaymentByProviderRef(service, orderId);
  // Replay after D12 upgrade: lookup by PaymentId
  if (!pending && paymentIdFromCallback) {
    pending = await loadPaymentByProviderRef(service, paymentIdFromCallback);
  }

  if (!pending) {
    throw new Error(`Invoice4U pending payment not found for order ${orderId}`);
  }

  const metadata = metadataFromPendingRow(pending);
  const parsed = parseInvoice4uCallback(rawBody, metadata);

  if (parsed.event.type === "payment.failed") {
    if (pending.status === "pending") {
      await service.from("payments").update({ status: "failed" }).eq("id", pending.id);
    }
    await service.from("audit_log").insert({
      tenant_id: pending.tenant_id,
      action: "payment.failed",
      entity_type: "payment",
      entity_id: pending.engagement_id,
      after_state: {
        provider_payment_ref: parsed.paymentId ?? orderId,
        order_id_client_usage: orderId,
        message: parsed.event.failureMessage,
      },
    });
    return { paymentId: pending.id, duplicate: false, status: "failed" };
  }

  // D17 — amount verify against pending row
  if (parsed.event.amountMinor !== pending.total_amount_minor) {
    await service.from("audit_log").insert({
      tenant_id: pending.tenant_id,
      action: "payment.amount_mismatch",
      entity_type: "payment",
      entity_id: pending.id,
      after_state: {
        expected_minor: pending.total_amount_minor,
        callback_minor: parsed.event.amountMinor,
        order_id_client_usage: orderId,
        payment_id: parsed.paymentId,
      },
    });
    return {
      paymentId: pending.id,
      duplicate: false,
      status: "amount_mismatch",
      amountMismatch: true,
    };
  }

  const paymentId = parsed.paymentId;
  if (!paymentId) {
    throw new Error("Invoice4U success callback missing PaymentId");
  }

  if (pending.status === "succeeded") {
    await finalisePayment(service, {
      tenantId: pending.tenant_id,
      paymentRow: {
        id: pending.id,
        engagement_id: pending.engagement_id,
        charge_type: pending.charge_type,
      },
      engagementId: metadata.engagement_id,
      chargeType: metadata.charge_type,
      skipDocumentEnqueue: Boolean(parsed.document),
    });
    if (parsed.document) {
      await applyBundledDocumentNotify(service, {
        tenantId: pending.tenant_id,
        providerPaymentRef: paymentId,
        externalDocumentId: parsed.document.externalDocumentId,
        externalDocumentNumber: parsed.document.externalDocumentNumber,
        documentUrl: parsed.document.documentUrl,
      });
    }
    return { paymentId: pending.id, duplicate: true, status: "succeeded" };
  }

  const now = new Date().toISOString();
  const { error: upgradeError } = await service
    .from("payments")
    .update({
      provider_payment_ref: paymentId,
      status: "succeeded",
      paid_at: now,
    })
    .eq("id", pending.id)
    .eq("status", "pending");

  if (upgradeError) throw upgradeError;

  if (parsed.customerId && pending.billing_account_id) {
    await upsertInvoice4uToken(service, {
      tenantId: pending.tenant_id,
      billingAccountId: pending.billing_account_id,
      customerId: parsed.customerId,
      cardBrand: parsed.cardBrand,
      cardLast4: parsed.cardLast4,
    });
  }

  await finalisePayment(service, {
    tenantId: pending.tenant_id,
    paymentRow: {
      id: pending.id,
      engagement_id: pending.engagement_id,
      charge_type: pending.charge_type,
    },
    engagementId: metadata.engagement_id,
    chargeType: metadata.charge_type,
    skipDocumentEnqueue: Boolean(parsed.document),
  });

  if (parsed.document) {
    await applyBundledDocumentNotify(service, {
      tenantId: pending.tenant_id,
      providerPaymentRef: paymentId,
      externalDocumentId: parsed.document.externalDocumentId,
      externalDocumentNumber: parsed.document.externalDocumentNumber,
      documentUrl: parsed.document.documentUrl,
    });
  }

  return { paymentId: pending.id, duplicate: false, status: "succeeded" };
}
