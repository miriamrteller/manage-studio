import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { getEnv } from "../../edge-runtime/env.ts";
import { markJobPaymentRequestPaid } from "../../jobs/mark-request-paid.ts";
import { applyBundledDocumentNotify } from "../bundled-document.ts";
import { finalisePayment } from "../finalise-payment.ts";
import { auditPaymentFailed } from "../payment-audit.ts";
import type { ChargeMetadata } from "../types.ts";
import { parseYpayCallback, peekYpayChargeIdentifier } from "./callback.ts";
import { loadYpayPaymentByRef, type YpayPendingPaymentRow } from "./pending-charge.ts";
import { verifyYpayTransaction, type YpayVerification } from "./verify-callback.ts";

export type YpayCallbackResult =
  | { paymentId: string; duplicate: boolean; status: "succeeded" | "failed"; jobPaymentRequest?: string }
  | { paymentId: string; duplicate: false; status: "amount_mismatch"; amountMismatch: true }
  | { paymentId: string; duplicate: false; status: "unverified"; reason: string };

export interface YpayCallbackDeps {
  /** Override for tests. Defaults to the live getTransactionsInfo verify, skipped under YPAY_MOCK. */
  verify?: (params: {
    service: SupabaseClient;
    tenantId: string;
    transactionId: string;
    expectedAmountMinor?: number;
  }) => Promise<YpayVerification>;
  /** Override for tests; defaults to YPAY_MOCK === "true". */
  mock?: boolean;
}

function metadataFromPendingRow(row: YpayPendingPaymentRow): ChargeMetadata {
  if (!row.engagement_id || !row.billing_account_id) {
    throw new Error("Pending YPay payment missing engagement or billing account");
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

async function settle(
  service: SupabaseClient,
  pending: YpayPendingPaymentRow,
  metadata: ChargeMetadata,
  skipDocumentEnqueue: boolean,
): Promise<void> {
  if (pending.job_payment_request_id) {
    // Photographer deposit/balance: no enrolment activation, no class confirmation email.
    await markJobPaymentRequestPaid(service, {
      requestId: pending.job_payment_request_id,
      paymentId: pending.id,
      method: "card",
    });
    return;
  }
  await finalisePayment(service, {
    tenantId: pending.tenant_id,
    paymentRow: { id: pending.id, engagement_id: pending.engagement_id, charge_type: pending.charge_type },
    engagementId: metadata.engagement_id,
    chargeType: metadata.charge_type,
    billingScheduleId: undefined,
    skipDocumentEnqueue,
  });
}

/**
 * Hosted YPay notifyUrl callback (API v1.9):
 *   peek chargeIdentifier → load pending row (D5) → verify with getTransactionsInfo
 *   (callbacks are unsigned) → amount check → upgrade provider_payment_ref to the
 *   YPay transactionId → settle (job request OR enrolment) → bundled document.
 *
 * Idempotent: a replay finds the row already `succeeded` (by chargeIdentifier or by
 * transactionId after the upgrade) and re-runs the idempotent settle/document steps
 * without inserting anything. A payment that cannot be verified stays `pending`.
 */
export async function processYpayPaymentCallback(
  service: SupabaseClient,
  rawBody: string,
  headers: Headers,
  deps: YpayCallbackDeps = {},
): Promise<YpayCallbackResult> {
  const mock = deps.mock ?? getEnv("YPAY_MOCK") === "true";
  if (mock && headers.get("x-mock-signature") !== "mock-valid") {
    throw new Error("Invalid mock YPay signature");
  }

  const chargeIdentifier = peekYpayChargeIdentifier(rawBody);
  if (!chargeIdentifier) {
    throw new Error("YPay callback missing chargeIdentifier");
  }

  // Placeholder metadata just to read the transactionId; real metadata comes from the row.
  const probe = parseYpayCallback(rawBody, chargeIdentifier, {
    tenant_id: "00000000-0000-0000-0000-000000000000",
    engagement_id: "00000000-0000-0000-0000-000000000000",
    billing_account_id: "00000000-0000-0000-0000-000000000000",
    charge_type: "initial",
  });

  let pending = await loadYpayPaymentByRef(service, chargeIdentifier);
  if (!pending && probe.transactionId) {
    pending = await loadYpayPaymentByRef(service, probe.transactionId);
  }
  if (!pending) {
    throw new Error(`YPay callback references unknown charge ${chargeIdentifier}`);
  }

  const metadata = metadataFromPendingRow(pending);
  const parsed = parseYpayCallback(rawBody, chargeIdentifier, metadata);

  if (parsed.event.type === "payment.failed") {
    if (pending.status === "pending") {
      await service.from("payments").update({ status: "failed" }).eq("id", pending.id).eq("status", "pending");
    }
    await auditPaymentFailed(service, {
      tenantId: pending.tenant_id,
      entityId: pending.id,
      afterState: {
        provider_payment_ref: chargeIdentifier,
        message: parsed.event.failureMessage ?? null,
        engagement_id: pending.engagement_id ?? "",
        payment_id: pending.id,
      },
    });
    return { paymentId: pending.id, duplicate: false, status: "failed" };
  }

  const transactionId = parsed.transactionId;
  if (!transactionId) {
    throw new Error("YPay success callback missing transactionId");
  }

  if (pending.status === "succeeded") {
    await settle(service, pending, metadata, Boolean(parsed.document));
    if (parsed.document) {
      await applyBundledDocumentNotify(service, {
        tenantId: pending.tenant_id,
        providerPaymentRef: transactionId,
        externalDocumentId: parsed.document.externalDocumentId,
        documentUrl: parsed.document.documentUrl,
      });
    }
    return {
      paymentId: pending.id,
      duplicate: true,
      status: "succeeded",
      jobPaymentRequest: pending.job_payment_request_id ?? undefined,
    };
  }

  if (pending.status !== "pending") {
    // failed/refunded rows never settle from a late callback.
    return { paymentId: pending.id, duplicate: true, status: "failed" };
  }

  if (!mock) {
    const verify = deps.verify ?? verifyYpayTransaction;
    const outcome = await verify({
      service,
      tenantId: pending.tenant_id,
      transactionId,
      expectedAmountMinor: pending.total_amount_minor,
    });
    if (!outcome.verified) {
      await service.from("audit_log").insert({
        tenant_id: pending.tenant_id,
        action: "payment.unverified_callback",
        entity_type: "payment",
        entity_id: pending.id,
        after_state: { provider: "ypay", transaction_id: transactionId, reason: outcome.reason },
      });
      return { paymentId: pending.id, duplicate: false, status: "unverified", reason: outcome.reason };
    }
  }

  if (parsed.event.amountMinor !== pending.total_amount_minor) {
    await service.from("audit_log").insert({
      tenant_id: pending.tenant_id,
      action: "payment.amount_mismatch",
      entity_type: "payment",
      entity_id: pending.id,
      after_state: {
        expected_minor: pending.total_amount_minor,
        callback_minor: parsed.event.amountMinor,
        charge_identifier: chargeIdentifier,
        transaction_id: transactionId,
      },
    });
    return { paymentId: pending.id, duplicate: false, status: "amount_mismatch", amountMismatch: true };
  }

  const now = new Date().toISOString();
  const { data: upgraded, error: upgradeError } = await service
    .from("payments")
    .update({ provider_payment_ref: transactionId, status: "succeeded", paid_at: now })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (upgradeError) throw upgradeError;
  if (!upgraded) {
    // Lost the race with a concurrent replay — that replay settles.
    return { paymentId: pending.id, duplicate: true, status: "succeeded" };
  }

  await settle(service, pending, metadata, Boolean(parsed.document));

  if (parsed.document) {
    await applyBundledDocumentNotify(service, {
      tenantId: pending.tenant_id,
      providerPaymentRef: transactionId,
      externalDocumentId: parsed.document.externalDocumentId,
      documentUrl: parsed.document.documentUrl,
    });
  }

  return {
    paymentId: pending.id,
    duplicate: false,
    status: "succeeded",
    jobPaymentRequest: pending.job_payment_request_id ?? undefined,
  };
}
