import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

import { resolveOfferingPrice } from "../email-dist/pricing.js";

import { getEnv } from "../env.ts";

import { deliverMockIcountIpn } from "./icount/mock-api.ts";

import { buildChargeMetadata, applyMockSyncEvent } from "./providers/mock.ts";

import { getPaymentProviderForTenant } from "./index.ts";

import { renewalIdempotencyKey } from "./billing-time.ts";



/** Bundled providers that charge renewals via a saved card token (mock or live). */

export const RENEWAL_TOKEN_PROVIDERS = ["grow", "icount", "invoice4u"] as const;

export type RenewalTokenProvider = (typeof RENEWAL_TOKEN_PROVIDERS)[number];



export function providerUsesSavedTokenRenewal(

  paymentProvider: string | null | undefined,

): paymentProvider is RenewalTokenProvider {

  return (RENEWAL_TOKEN_PROVIDERS as readonly string[]).includes(paymentProvider ?? "");

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



  const pricing = resolveOfferingPrice({ price_minor: offering.price_minor as number });



  const billingAccountId =

    (schedule.billing_account_id as string | null) ??

    (engagement.billing_account_id as string | null);

  if (!billingAccountId) {

    return { outcome: "skipped" };

  }



  const paymentProvider = tenant.payment_provider as string;

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

  const metadata = buildChargeMetadata({

    tenantId: schedule.tenant_id,

    engagementId: engagement.id as string,

    billingAccountId,

    offeringId: engagement.offering_id as string,

    personId: engagement.person_id as string,

    vatRate: pricing.vatRate,

    pretaxMinor: pricing.pretaxMinor,

    vatMinor: pricing.vatMinor,

    totalMinor: pricing.totalMinor,

    chargeType: "renewal",

    billingScheduleId: schedule.id,

  });



  const chargeParams = {

    amountMinor: pricing.totalMinor,

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

    } else {

      const result = await provider.createCharge(chargeParams);

      if (result.emitSyncEvent) {

        await applyMockSyncEvent(service, result.emitSyncEvent, paymentProvider);

      }

    }



    return { outcome: "charged" };

  } catch (err) {
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


