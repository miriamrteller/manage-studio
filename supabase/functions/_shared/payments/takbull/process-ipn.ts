import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { markJobPaymentRequestPaid } from "../../jobs/mark-request-paid.ts";
import { applyBundledDocumentNotify } from "../bundled-document.ts";
import { documentKindFromTakbullType } from "../document-kind.ts";
import { finalisePayment } from "../finalise-payment.ts";
import { auditPaymentFailed } from "../payment-audit.ts";
import type { TakbullApi, TakbullTransaction, TakbullValidation } from "./client.ts";
import { takbullApiForTenant } from "./index.ts";
import { takbullPaymentMethod, type TakbullIpn } from "./ipn.ts";
import { loadTakbullOrder, loadTakbullPayment, type TakbullOrderRow, type TakbullPaymentRow } from "./pending-charge.ts";

export type TakbullIpnResult =
  | { status: "succeeded"; paymentId: string; duplicate: boolean }
  | { status: "failed"; paymentId: string; duplicate: boolean }
  | { status: "pending"; paymentId: string }
  | { status: "unverified"; paymentId: string; reason: string }
  | { status: "amount_mismatch"; paymentId: string }
  | { status: "unknown_order" };

export interface TakbullIpnDeps {
  /** The studio's Takbull account for this payment; tests and the dev mock inject one. */
  apiFor?: (row: TakbullPaymentRow) => Promise<TakbullApi>;
  finalise?: typeof finalisePayment;
  now?: () => Date;
}

/** Takbull ValidateNotification orderStatus that means the order will not be paid. */
const ORDER_NOT_PAID = new Set([1, 5, 9]); // failed · cancelled · abandoned
/** GetTransaction status: 1 approved · 2 declined · 4 pending · 6 failed. */
const TX_APPROVED = 1;
const TX_DECLINED = new Set([2, 6]);

/**
 * Pure: what Takbull's own answers say about the payment. The notice itself only names the
 * order; the validation and the transaction decide. An approved charge must also be for the
 * amount we asked (minor units, rounded from Takbull's decimal amount).
 */
export function takbullOutcome(input: {
  expectedMinor: number;
  validation: TakbullValidation;
  transaction: TakbullTransaction | null;
}): "succeeded" | "failed" | "pending" | "unverified" | "amount_mismatch" {
  const { validation, transaction } = input;
  if (validation.internalCode !== 0) return "unverified";
  if (validation.orderStatus !== undefined && ORDER_NOT_PAID.has(validation.orderStatus)) return "failed";
  if (!transaction) return "pending";
  if (transaction.status !== undefined && TX_DECLINED.has(transaction.status)) return "failed";
  if (transaction.statusCode !== 0 || transaction.status !== TX_APPROVED) return "pending";
  // A charge (10), or a token/J2 deal (60); refunds and cancellations are never a payment.
  if (transaction.transactionType !== undefined && ![10, 60].includes(transaction.transactionType)) return "unverified";
  if (Math.round(Number(transaction.amount) * 100) !== input.expectedMinor) return "amount_mismatch";
  return "succeeded";
}

async function audit(
  service: SupabaseClient,
  row: TakbullPaymentRow,
  action: string,
  afterState: Record<string, unknown>,
): Promise<void> {
  await service.from("audit_log").insert({
    tenant_id: row.tenant_id,
    action,
    entity_type: "payment",
    entity_id: row.id,
    after_state: { provider: "takbull", ...afterState },
  });
}

async function saveCardToken(
  service: SupabaseClient,
  row: TakbullPaymentRow,
  tx: TakbullTransaction,
): Promise<void> {
  if (!tx.cardToken || !row.billing_account_id) return;
  // The card the client just paid with becomes the account's card for later months.
  await service
    .from("payment_method_tokens")
    .update({ is_default: false, revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("billing_account_id", row.billing_account_id)
    .eq("provider", "takbull")
    .is("revoked_at", null);
  const month = Number(tx.cardTokenExpirationMonth);
  const year = Number(tx.cardTokenExpirationYear);
  await service.from("payment_method_tokens").insert({
    tenant_id: row.tenant_id,
    billing_account_id: row.billing_account_id,
    provider: "takbull",
    provider_token: tx.cardToken,
    card_brand: tx.cardtype ?? null,
    last4: tx.last4DigitsCardNumber ?? null,
    exp_month: month >= 1 && month <= 12 ? month : null,
    exp_year: Number.isFinite(year) && year > 0 ? (year < 100 ? 2000 + year : year) : null,
    is_default: true,
  });
}

async function settle(
  service: SupabaseClient,
  row: TakbullPaymentRow,
  order: TakbullOrderRow,
  tx: TakbullTransaction,
  finalise: typeof finalisePayment,
): Promise<void> {
  if (row.job_payment_request_id) {
    // A project deposit / balance: the request is paid; no enrolment to activate.
    await markJobPaymentRequestPaid(service, {
      requestId: row.job_payment_request_id,
      paymentId: row.id,
      method: takbullPaymentMethod(tx.paymentMethod),
    });
    return;
  }
  await finalise(service, {
    tenantId: row.tenant_id,
    paymentRow: { id: row.id, engagement_id: row.engagement_id, charge_type: row.charge_type },
    engagementId: order.metadata.engagement_id,
    chargeType: order.metadata.charge_type,
    billingScheduleId: order.metadata.billing_schedule_id,
    // Takbull issued the document with the charge: nothing to queue.
    skipDocumentEnqueue: tx.isDocumentCreated === true,
  });
}

/**
 * The takbull-ipn handler. Idempotent: a notice for a settled payment changes nothing, and two
 * notices racing settle once (the status update is conditional). A notice we can't confirm with
 * Takbull leaves the payment pending; Takbull retries, and the checkout keeps waiting.
 */
export async function processTakbullIpn(
  service: SupabaseClient,
  ipn: TakbullIpn,
  deps: TakbullIpnDeps = {},
): Promise<TakbullIpnResult> {
  const row = await loadTakbullPayment(service, {
    orderReference: ipn.orderReference,
    uniqId: ipn.uniqId,
    transactionInternalNumber: ipn.transactionInternalNumber,
  });
  if (!row) return { status: "unknown_order" };
  if (row.status === "succeeded") return { status: "succeeded", paymentId: row.id, duplicate: true };
  if (row.status !== "pending") return { status: "failed", paymentId: row.id, duplicate: true };

  const order = await loadTakbullOrder(service, row.id);
  const uniqId = order?.uniq_id ?? ipn.uniqId;
  if (!order || !uniqId) {
    await audit(service, row, "payment.unverified_callback", { reason: "no Takbull order on our side" });
    return { status: "unverified", paymentId: row.id, reason: "no order" };
  }
  // A notice naming another order than the one we created is not ours to settle.
  if (ipn.uniqId && order.uniq_id && ipn.uniqId !== order.uniq_id) {
    await audit(service, row, "payment.unverified_callback", { reason: "order id mismatch", notice_uniq_id: ipn.uniqId });
    return { status: "unverified", paymentId: row.id, reason: "order id mismatch" };
  }

  const api = await (deps.apiFor ?? ((r: TakbullPaymentRow) => takbullApiForTenant(service, r.tenant_id)))(row);
  const validation = await api.validateNotification(uniqId);
  const transaction = ipn.transactionInternalNumber ? await api.getTransaction(ipn.transactionInternalNumber) : null;
  const outcome = takbullOutcome({ expectedMinor: row.total_amount_minor, validation, transaction });

  if (outcome === "unverified") {
    await audit(service, row, "payment.unverified_callback", {
      reason: validation.internalDescription ?? "not confirmed by Takbull",
      internal_code: validation.internalCode,
    });
    return { status: "unverified", paymentId: row.id, reason: validation.internalDescription ?? "not confirmed" };
  }
  if (outcome === "pending") return { status: "pending", paymentId: row.id };
  if (outcome === "amount_mismatch") {
    await audit(service, row, "payment.amount_mismatch", {
      expected_minor: row.total_amount_minor,
      takbull_amount: transaction?.amount ?? null,
      transaction_internal_number: ipn.transactionInternalNumber,
    });
    return { status: "amount_mismatch", paymentId: row.id };
  }
  if (outcome === "failed") {
    await service.from("payments").update({ status: "failed" }).eq("id", row.id).eq("status", "pending");
    await auditPaymentFailed(service, {
      tenantId: row.tenant_id,
      entityId: row.id,
      afterState: {
        provider_payment_ref: uniqId,
        message: ipn.statusDescription ?? null,
        engagement_id: row.engagement_id ?? "",
        payment_id: row.id,
      },
    });
    return { status: "failed", paymentId: row.id, duplicate: false };
  }

  // Succeeded, confirmed by Takbull for our amount.
  const tx = transaction as TakbullTransaction;
  const txNumber = ipn.transactionInternalNumber as string;
  const { data: upgraded, error } = await service
    .from("payments")
    .update({
      provider_payment_ref: txNumber,
      status: "succeeded",
      paid_at: (deps.now ?? (() => new Date()))().toISOString(),
      payment_method: takbullPaymentMethod(tx.paymentMethod),
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  // Lost the race with another notice for the same payment: that one settles.
  if (!upgraded) return { status: "succeeded", paymentId: row.id, duplicate: true };

  await settle(service, row, order, tx, deps.finalise ?? finalisePayment);

  if (tx.isDocumentCreated && tx.invoiceUniqId) {
    const { data: tenant } = await service
      .from("tenants")
      .select("takbull_document_type")
      .eq("id", row.tenant_id)
      .maybeSingle();
    await applyBundledDocumentNotify(service, {
      tenantId: row.tenant_id,
      providerPaymentRef: txNumber,
      externalDocumentId: tx.invoiceUniqId,
      externalDocumentNumber: tx.documentNumber != null ? String(tx.documentNumber) : undefined,
      documentKind: documentKindFromTakbullType(tenant?.takbull_document_type),
    });
  }

  if (order.save_card) await saveCardToken(service, row, tx);
  return { status: "succeeded", paymentId: row.id, duplicate: false };
}
