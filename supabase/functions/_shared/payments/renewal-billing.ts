import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

import { resolveOfferingPrice } from "../email-dist/pricing.js";

import { getEnv } from "../edge-runtime/env.ts";

import { deliverMockIcountIpn } from "./icount/mock-api.ts";

import { buildChargeMetadata, applyMockSyncEvent } from "./providers/mock.ts";

import { getPaymentProviderForTenant, isOfflinePaymentProvider } from "./index.ts";

import { renewalIdempotencyKey } from "./billing-time.ts";
import { resolveMonthAmount } from "./month-amount.ts";
import { takbullRenewalKey } from "./providers/takbull.ts";



/** Bundled providers that charge renewals via a saved card token (mock or live). */

export const RENEWAL_TOKEN_PROVIDERS = ["grow", "icount", "invoice4u", "takbull"] as const;

export type RenewalTokenProvider = (typeof RENEWAL_TOKEN_PROVIDERS)[number];



export function providerUsesSavedTokenRenewal(

  paymentProvider: string | null | undefined,

): paymentProvider is RenewalTokenProvider {

  return (RENEWAL_TOKEN_PROVIDERS as readonly string[]).includes(paymentProvider ?? "");

}



/**
 * Pay at the studio until a card is saved (payments B c): an enrolment whose first payment was
 * recorded by hand (provider 'manual') and that has no saved card with the studio's current
 * provider is not charged online and gets no dunning. This covers a studio that moved from pay
 * at the studio to online: its existing students keep paying at the studio until a parent adds
 * a card through the card link.
 */
export async function collectedAtStudio(
  service: SupabaseClient,
  params: { engagementId: string; billingAccountId: string; paymentProvider: string },
): Promise<boolean> {
  const { data: card } = await service
    .from("payment_method_tokens")
    .select("id")
    .eq("billing_account_id", params.billingAccountId)
    .eq("provider", params.paymentProvider)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (card) return false;

  const { data: first } = await service
    .from("payments")
    .select("provider")
    .eq("engagement_id", params.engagementId)
    .eq("charge_type", "initial")
    .in("status", ["succeeded", "partially_refunded", "refunded"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return first?.provider === "manual";
}

/** First day of the month after `periodYm` (YYYY-MM), early morning in Israel. */
export function nextMonthCheckAt(periodYm: string): string {
  const [year, month] = periodYm.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1, 6, 0, 0));
  return next.toISOString();
}

/**
 * A schedule paid at the studio is not charged; look at it again next month instead of every
 * run, so these schedules never fill the run's batch and crowd out ones that can be charged.
 * Not a dunning attempt: attempt_count and last_error stay as they are.
 */
async function deferStudioSchedule(service: SupabaseClient, scheduleId: string, periodYm: string) {
  await service
    .from("billing_schedules")
    .update({ next_attempt_at: nextMonthCheckAt(periodYm) })
    .eq("id", scheduleId);
}

export async function loadRenewalSavedToken(

  service: SupabaseClient,

  billingAccountId: string,

): Promise<string | undefined> {

  const { data: tokenRow } = await service

    .from("payment_method_tokens")

    .select("provider_token")

    .eq("billing_account_id", billingAccountId)

    .is("revoked_at", null)

    .eq("is_default", true)

    .maybeSingle();

  return (tokenRow?.provider_token as string | null) ?? undefined;

}



export type BillingScheduleRow = {

  id: string;

  tenant_id: string;

  engagement_id: string;

  billing_account_id: string | null;

  attempt_count: number;

};



export type ProcessBillingScheduleResult =

  | { outcome: "charged" }

  | { outcome: "failed"; error: string }

  | { outcome: "skipped" };



export async function processBillingSchedule(

  service: SupabaseClient,

  schedule: BillingScheduleRow,

  periodYm: string,

): Promise<ProcessBillingScheduleResult> {

  const { data: engagement } = await service

    .from("engagements")

    .select("id, offering_id, person_id, billing_account_id, provider_customer_ref")

    .eq("id", schedule.engagement_id)

    .single();



  const { data: offering } = engagement

    ? await service

      .from("offerings")

      .select("price_minor, currency, billing_mode")

      .eq("id", engagement.offering_id)

      .single()

    : { data: null };



  const { data: tenant } = await service

    .from("tenants")

    .select("currency, payment_provider")

    .eq("id", schedule.tenant_id)

    .single();



  if (!engagement || !offering || !tenant || offering.billing_mode !== "recurring") {

    return { outcome: "skipped" };

  }

  // Pay-at-the-studio tenant: nothing can be charged online; the studio collects and
  // records monthly amounts itself.
  if (isOfflinePaymentProvider(tenant.payment_provider as string | null)) {
    await deferStudioSchedule(service, schedule.id, periodYm);
    return { outcome: "skipped" };
  }



  const pricing = resolveOfferingPrice({ price_minor: offering.price_minor as number });



  const billingAccountId =

    (schedule.billing_account_id as string | null) ??

    (engagement.billing_account_id as string | null);

  if (!billingAccountId) {

    return { outcome: "skipped" };

  }



  const paymentProvider = tenant.payment_provider as string;

  if (await collectedAtStudio(service, {
    engagementId: engagement.id as string,
    billingAccountId,
    paymentProvider,
  })) {
    await deferStudioSchedule(service, schedule.id, periodYm);
    return { outcome: "skipped" };
  }

  let savedToken: string | undefined;

  if (providerUsesSavedTokenRenewal(paymentProvider)) {

    savedToken = await loadRenewalSavedToken(service, billingAccountId);

    if (!savedToken) {
      // V1 accept: Grow may surface the same failure via sync throw and later webhook;
      // optimistic attempt_count guard prevents duplicate increments within the same count,
      // but sequential paths can advance twice for one charge attempt.
      const { applyBillingScheduleDunningFailure } = await import(
        "./apply-billing-schedule-dunning-failure.ts"
      );
      await applyBillingScheduleDunningFailure(service, {
        billingScheduleId: schedule.id,
        failureMessage: "No saved card token",
      });
      return { outcome: "failed", error: `No saved ${paymentProvider} card token` };
    }

  }



  const provider = await getPaymentProviderForTenant(service, schedule.tenant_id);
  // This month's amount: a one-off amount, else the student's own, else the class price.
  const monthAmount = await resolveMonthAmount(service, {
    scheduleId: schedule.id,
    period: periodYm,
    classPriceMinor: pricing.totalMinor,
  });

  const metadata = buildChargeMetadata({

    tenantId: schedule.tenant_id,

    engagementId: engagement.id as string,

    billingAccountId,

    offeringId: engagement.offering_id as string,

    personId: engagement.person_id as string,

    vatRate: pricing.vatRate,

    pretaxMinor: pricing.pretaxMinor,

    vatMinor: pricing.vatMinor,

    totalMinor: monthAmount.amountMinor,

    chargeType: "renewal",

    billingScheduleId: schedule.id,

  });



  const chargeParams = {

    amountMinor: monthAmount.amountMinor,

    currency: (offering.currency ?? tenant.currency ?? "ILS").toUpperCase(),

    idempotencyKey: renewalIdempotencyKey(engagement.id as string, periodYm),

    metadata,

    customerRef: (engagement.provider_customer_ref as string | null) ?? undefined,

    savedToken,

  };



  try {

    if (paymentProvider === "icount") {

      if (!provider.chargeWithToken) {

        throw new Error("iCount chargeWithToken not implemented");

      }

      const result = await provider.chargeWithToken(chargeParams);

      if (result.pendingWebhook && getEnv("ICOUNT_MOCK") === "true") {

        await deliverMockIcountIpn(service, provider, {

          providerPaymentRef: result.providerPaymentRef,

          amountMinor: chargeParams.amountMinor,

          currency: chargeParams.currency,

          metadata,

          tenantId: schedule.tenant_id,

        });

      }

    } else if (paymentProvider === "invoice4u") {

      // D14 — Invoice4U renewals use ChargeWithToken (CustomerId), not createCharge(savedToken).

      if (!provider.chargeWithToken) {

        throw new Error("Invoice4U chargeWithToken not implemented");

      }

      const result = await provider.chargeWithToken(chargeParams);

      if (result.emitSyncEvent) {

        await applyMockSyncEvent(service, result.emitSyncEvent, paymentProvider);

      }

    } else if (paymentProvider === "takbull") {
      // ChargeToken; the result comes back through takbull-ipn (settle, or dunning on a
      // decline). One key per attempt, so a run never charges an attempt that is still waiting.
      if (!provider.chargeWithToken) {
        throw new Error("Takbull chargeWithToken not implemented");
      }
      await provider.chargeWithToken({
        ...chargeParams,
        idempotencyKey: takbullRenewalKey(chargeParams.idempotencyKey, schedule.attempt_count),
      });
    } else {

      const result = await provider.createCharge(chargeParams);

      if (result.emitSyncEvent) {

        await applyMockSyncEvent(service, result.emitSyncEvent, paymentProvider);

      }

    }



    return { outcome: "charged" };

  } catch (err) {
    // This attempt was already sent and is waiting for its notice (or is paid): not a failure.
    if (err instanceof Error && err.name === "TakbullDuplicateChargeError") {
      return { outcome: "skipped" };
    }
    const { applyBillingScheduleDunningFailure } = await import(
      "./apply-billing-schedule-dunning-failure.ts"
    );
    await applyBillingScheduleDunningFailure(service, {
      billingScheduleId: schedule.id,
      failureMessage: err instanceof Error ? err.message : "Charge failed",
    });

    return {
      outcome: "failed",
      error: err instanceof Error ? err.message : "Charge failed",
    };
  }

}


