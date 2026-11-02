import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { markJobPaymentRequestPaid } from "../../jobs/mark-request-paid.ts";
import { applyBillingScheduleDunningFailure } from "../apply-billing-schedule-dunning-failure.ts";
import { cardLinkPeriod } from "../card-link.ts";
import { finalisePayment } from "../finalise-payment.ts";
import { GrowPaymentProvider, type ParsedGrowNotify } from "../providers/grow.ts";
import type { GrowPaymentRow } from "./pending-charge.ts";
import {
  type GrowNotifyDeps,
  type GrowNotifyResult,
  processGrowNotifyWith,
} from "./process-notify-core.ts";

export type { GrowNotifyDeps, GrowNotifyResult } from "./process-notify-core.ts";

/** Settle a Grow payment that is now `succeeded`: the job request, or else the enrolment. */
export async function settleGrowPayment(
  service: SupabaseClient,
  row: GrowPaymentRow,
  parsed: ParsedGrowNotify,
): Promise<void> {
  if (row.job_payment_request_id) {
    // Photographer deposit/balance: settle the request, not an enrolment.
    await markJobPaymentRequestPaid(service, {
      requestId: row.job_payment_request_id,
      paymentId: row.id,
      method: "card",
    });
    return;
  }
  await finalisePayment(service, {
    tenantId: row.tenant_id,
    paymentRow: { id: row.id, engagement_id: row.engagement_id, charge_type: row.charge_type },
    engagementId: row.engagement_id as string,
    chargeType: row.charge_type === "renewal" ? "renewal" : "initial",
    billingScheduleId: parsed.event.metadata.billing_schedule_id,
    paidForPeriod: cardLinkPeriod(parsed.event.providerPaymentRef) ?? undefined,
  });
}

/**
 * Grow payment notify with the real dependencies. The checks themselves (webhook key, pending
 * row, amount, approveTransaction status 1, idempotency) live in process-notify-core.ts.
 */
export function processGrowNotify(
  service: SupabaseClient,
  rawBody: string,
  overrides: Partial<GrowNotifyDeps> = {},
): Promise<GrowNotifyResult> {
  const provider = new GrowPaymentProvider(service);
  return processGrowNotifyWith(service, rawBody, {
    approveTransaction: (tenantId, parsed) => provider.approveTransaction(tenantId, parsed),
    persistCardToken: (metadata, body) => provider.persistCardToken(metadata, body),
    settle: settleGrowPayment,
    renewalFailed: applyBillingScheduleDunningFailure,
    ...overrides,
  });
}
