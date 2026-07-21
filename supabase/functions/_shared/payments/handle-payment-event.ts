import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { finalisePayment } from "./finalise-payment.ts";
import { auditPaymentFailed } from "./payment-audit.ts";
import { ChargeMetadataSchema, type PaymentEvent } from "./types.ts";

export { buildMockPaymentEvent } from "./mock-payment-event.ts";

export async function handlePaymentEventInternal(
  service: SupabaseClient,
  event: PaymentEvent,
  providerSlug: string,
): Promise<{ paymentId: string; duplicate: boolean }> {
  const metadata = ChargeMetadataSchema.parse(event.metadata);

  if (event.type === "payment.failed") {
    if (metadata.charge_type === "renewal" && metadata.billing_schedule_id) {
      const { applyBillingScheduleDunningFailure } = await import(
        "./apply-billing-schedule-dunning-failure.ts"
      );
      await applyBillingScheduleDunningFailure(service, {
        billingScheduleId: metadata.billing_schedule_id,
        failureMessage: event.failureMessage ?? "Payment failed",
      });
    }

    await auditPaymentFailed(service, {
      tenantId: metadata.tenant_id,
      entityId: metadata.engagement_id,
      afterState: {
        provider_payment_ref: event.providerPaymentRef,
        message: event.failureMessage ?? null,
        engagement_id: metadata.engagement_id,
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
