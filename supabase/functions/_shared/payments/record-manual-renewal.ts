import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { resolveMonthAmount } from "./month-amount.ts";
import type { FinalisePaymentParams } from "./types.ts";

/**
 * A monthly fee paid at the studio (cash or bank transfer) for an ACTIVE enrolment, recorded
 * by an admin. It pays the month the enrolment's monthly plan is due for (its billing
 * schedule's next_billing_date), as a renewal payment linked to that schedule, and moves the
 * schedule on one month. Recording again pays the next month, so paying ahead works; the same
 * month can never be recorded twice (the reference is unique per schedule and month).
 *
 * Kept free of email / React imports (finalise is passed in) so it is testable in isolation.
 */
export interface ManualRenewalInput {
  tenantId: string;
  engagement: {
    id: string;
    person_id: string;
    offering_id: string;
    billing_account_id: string | null;
  };
  method: "cash" | "bank_transfer" | "bit";
  amountMinor?: number;
  note?: string;
  /** When the money was received (ISO); defaults to now. */
  paidAt?: string;
  actorUserId: string;
}

export interface ManualRenewalDeps {
  finalise(service: SupabaseClient, params: FinalisePaymentParams): Promise<void>;
  /** Gross offering price in minor units (the same rule as the first payment). */
  priceMinor(offeringPriceMinor: number): number;
}

export type ManualRenewalResult =
  | { ok: true; paymentId: string; period: string }
  | { ok: false; status: number; error: string; code: string };

/** Schedules a payment can still be recorded against (cancelled plans are closed). */
const OPEN_SCHEDULE_STATUSES = ["active", "paused", "suspended"];

/** Plain English for the payment description (the receipt line uses the studio's own wording). */
const MANUAL_METHOD_TEXT: Record<ManualRenewalInput["method"], string> = {
  cash: "cash",
  bank_transfer: "bank transfer",
  bit: "Bit / PayBox",
};

export function manualRenewalRef(scheduleId: string, period: string): string {
  return `manual_renewal_${scheduleId}_${period}`;
}

export async function recordManualRenewal(
  service: SupabaseClient,
  input: ManualRenewalInput,
  deps: ManualRenewalDeps,
): Promise<ManualRenewalResult> {
  const { data: schedule } = await service
    .from("billing_schedules")
    .select("id, tenant_id, billing_account_id, next_billing_date, status")
    .eq("engagement_id", input.engagement.id)
    .maybeSingle();

  if (!schedule || schedule.tenant_id !== input.tenantId ||
    !OPEN_SCHEDULE_STATUSES.includes(schedule.status as string)) {
    return {
      ok: false,
      status: 409,
      code: "no_monthly_plan",
      error: "This enrolment has no monthly plan to record a payment for",
    };
  }

  const billingAccountId = (schedule.billing_account_id as string | null) ??
    input.engagement.billing_account_id;
  if (!billingAccountId) {
    return { ok: false, status: 400, code: "no_billing_account", error: "Engagement missing billing account" };
  }

  const [{ data: offering }, { data: tenant }, { data: person }] = await Promise.all([
    service.from("offerings").select("price_minor, currency").eq("id", input.engagement.offering_id).single(),
    service.from("tenants").select("currency").eq("id", input.tenantId).single(),
    service.from("people").select("account_id").eq("id", input.engagement.person_id).single(),
  ]);
  if (!offering || !tenant) {
    return { ok: false, status: 404, code: "not_found", error: "Offering or tenant not found" };
  }

  const period = (schedule.next_billing_date as string).slice(0, 7);
  const classPriceMinor = deps.priceMinor(offering.price_minor as number);
  // The month's amount (one-off, else the student's own, else the class price); the admin may
  // still type what was actually paid.
  const monthAmount = await resolveMonthAmount(service, {
    scheduleId: schedule.id as string,
    period,
    classPriceMinor,
  });
  const totalMinor = input.amountMinor ?? monthAmount.amountMinor;

  const { data: paymentRow, error: insertError } = await service
    .from("payments")
    .insert({
      tenant_id: input.tenantId,
      account_id: person?.account_id ?? null,
      person_id: input.engagement.person_id,
      offering_id: input.engagement.offering_id,
      engagement_id: input.engagement.id,
      billing_account_id: billingAccountId,
      charge_type: "renewal",
      provider: "manual",
      provider_payment_ref: manualRenewalRef(schedule.id as string, period),
      payment_method: input.method,
      pretax_amount_minor: 0,
      vat_rate: 0,
      vat_amount_minor: 0,
      total_amount_minor: totalMinor,
      currency: ((offering.currency as string | null) ?? (tenant.currency as string | null) ?? "ILS")
        .toUpperCase(),
      status: "succeeded",
      paid_at: input.paidAt ?? new Date().toISOString(),
      description: input.note ??
        [
          `Monthly fee ${period}, ${MANUAL_METHOD_TEXT[input.method]}`,
          monthAmount.source === "one_off" ? monthAmount.note : null,
        ].filter(Boolean).join(" — "),
      created_by: input.actorUserId,
      approved_by: input.actorUserId,
    })
    .select("id, engagement_id, charge_type")
    .single();

  if (insertError || !paymentRow) {
    if ((insertError as { code?: string } | null)?.code === "23505") {
      return {
        ok: false,
        status: 409,
        code: "month_already_recorded",
        error: `A payment is already recorded for ${period}`,
      };
    }
    return { ok: false, status: 500, code: "insert_failed", error: insertError?.message ?? "Insert failed" };
  }

  await service.from("audit_log").insert({
    tenant_id: input.tenantId,
    action: "manual_renewal_recorded",
    entity_type: "payment",
    entity_id: paymentRow.id,
    actor_id: input.actorUserId,
    after_state: {
      engagement_id: input.engagement.id,
      billing_schedule_id: schedule.id,
      period,
      method: input.method,
      amount_minor: totalMinor,
      class_price_minor: classPriceMinor,
      month_amount_minor: monthAmount.amountMinor,
      month_amount_source: monthAmount.source,
      amount_changed: totalMinor !== monthAmount.amountMinor,
    },
  });

  await deps.finalise(service, {
    tenantId: input.tenantId,
    paymentRow: paymentRow as { id: string; engagement_id: string | null; charge_type: string },
    engagementId: input.engagement.id,
    chargeType: "renewal",
    billingScheduleId: schedule.id as string,
    actorUserId: input.actorUserId,
    paidForPeriod: period,
  });

  return { ok: true, paymentId: paymentRow.id as string, period };
}
