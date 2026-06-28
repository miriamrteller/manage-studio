import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { finalisePayment } from "./finalise-payment.ts";
import { ChargeMetadataSchema, type PaymentEvent } from "./types.ts";

export async function handlePaymentEventInternal(
  service: SupabaseClient,
  event: PaymentEvent,
  providerSlug: string,
): Promise<{ paymentId: string; duplicate: boolean }> {
  const metadata = ChargeMetadataSchema.parse(event.metadata);

  if (event.type === "payment.failed") {
    if (metadata.charge_type === "renewal" && metadata.billing_schedule_id) {
      const { data: schedule } = await service
        .from("billing_schedules")
        .select("attempt_count, engagement_id")
        .eq("id", metadata.billing_schedule_id)
        .single();

      const nextAttempt = (schedule?.attempt_count as number | undefined ?? 0) + 1;
      const { dunningNextAttemptAt } = await import("./billing-time.ts");

      const updates: Record<string, unknown> = {
        attempt_count: nextAttempt,
        last_attempt_at: new Date().toISOString(),
        last_error: event.failureMessage ?? "Payment failed",
      };

      if (nextAttempt >= 3) {
        updates.status = "suspended";
        updates.next_attempt_at = null;
        if (schedule?.engagement_id) {
          await service
            .from("engagements")
            .update({ billing_status: "suspended" })
            .eq("id", schedule.engagement_id);
        }
      } else {
        updates.next_attempt_at = dunningNextAttemptAt(nextAttempt);
      }

      await service
        .from("billing_schedules")
        .update(updates)
        .eq("id", metadata.billing_schedule_id);
    }

    await service.from("audit_log").insert({
      tenant_id: metadata.tenant_id,
      action: "payment.failed",
      entity_type: "payment",
      entity_id: metadata.engagement_id,
      after_state: {
        provider_payment_ref: event.providerPaymentRef,
        message: event.failureMessage,
      },
    });

    return { paymentId: "", duplicate: false };
  }

  const { data: existing } = await service
    .from("payments")
    .select("id, engagement_id, charge_type")
    .eq("provider_payment_ref", event.providerPaymentRef)
    .maybeSingle();

  let paymentRow: { id: string; engagement_id: string | null; charge_type: string };

  if (existing) {
    paymentRow = existing as { id: string; engagement_id: string | null; charge_type: string };
  } else {
    const { data: engagement } = await service
      .from("engagements")
      .select("id, person_id, offering_id, billing_account_id")
      .eq("id", metadata.engagement_id)
      .single();

    if (!engagement) {
      throw new Error("Engagement not found");
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
        person_id: event.personId ?? engagement.person_id,
        offering_id: event.offeringId ?? engagement.offering_id,
        engagement_id: metadata.engagement_id,
        billing_account_id: metadata.billing_account_id,
        charge_type: metadata.charge_type,
        provider: providerSlug,
        provider_payment_ref: event.providerPaymentRef,
        payment_method: "card",
        pretax_amount_minor: event.pretaxAmountMinor,
        vat_rate: event.vatRate,
        vat_amount_minor: event.vatAmountMinor,
        total_amount_minor: event.amountMinor,
        currency: event.currency.toUpperCase(),
        status: "succeeded",
        paid_at: new Date().toISOString(),
        description: `${metadata.charge_type} payment ${metadata.engagement_id}`,
      })
      .select("id, engagement_id, charge_type")
      .single();

    if (insertError || !inserted) {
      throw insertError ?? new Error("Payment insert failed");
    }
    paymentRow = inserted as { id: string; engagement_id: string | null; charge_type: string };
  }

  await finalisePayment(service, {
    tenantId: metadata.tenant_id,
    paymentRow,
    engagementId: metadata.engagement_id,
    chargeType: metadata.charge_type,
    billingScheduleId: metadata.billing_schedule_id,
  });

  return { paymentId: paymentRow.id, duplicate: Boolean(existing) };
}

export function buildMockPaymentEvent(
  params: ChargeParamsLike,
): PaymentEvent {
  return {
    type: "payment.succeeded",
    providerPaymentRef: params.providerPaymentRef,
    metadata: params.metadata,
    amountMinor: params.amountMinor,
    currency: params.currency,
    pretaxAmountMinor: 0,
    vatAmountMinor: 0,
    vatRate: 0,
    offeringId: params.metadata.offering_id,
    personId: params.metadata.person_id,
  };
}

interface ChargeParamsLike {
  providerPaymentRef: string;
  amountMinor: number;
  currency: string;
  metadata: PaymentEvent["metadata"];
}
