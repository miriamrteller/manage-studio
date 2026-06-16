import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/supabase.ts";
import { resolveOfferingPrice } from "../_shared/email-dist/pricing.js";
import { extractWaiverToken, verifyWaiverToken } from "../_shared/waiver-token.ts";
import { resolveAllowedTokenRecipientEmails } from "../_shared/token-recipient.ts";
import { getPaymentProviderForTenant } from "../_shared/payments/index.ts";
import { applyMockSyncEvent, buildChargeMetadata } from "../_shared/payments/providers/mock.ts";
import { ensureBillingAccountForStudent } from "../_shared/ensure-billing-account.ts";

interface CreateCheckoutBody {
  offering_id: string;
  engagement_id: string;
  enrolment_token?: string;
}

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as CreateCheckoutBody;
    if (!body.offering_id || !body.engagement_id) {
      return jsonResponse({ error: "offering_id and engagement_id are required" }, 400);
    }

    const service = createServiceClient();
    const authHeader = req.headers.get("Authorization") ?? "";
    let tenantId: string | null = null;
    let authUserId: string | null = null;
    let tokenEmail: string | null = null;

    const bodyToken = typeof body.enrolment_token === "string" ? body.enrolment_token : null;
    const headerToken = extractWaiverToken(authHeader);
    const rawWaiverToken = headerToken ?? bodyToken;
    const verifiedToken = rawWaiverToken ? await verifyWaiverToken(rawWaiverToken) : null;

    // Authenticated checkout: resolve tenant from the logged-in user's profile.
    // Guests still send Authorization (anon JWT); invalid/non-user tokens fall through.
    if (authHeader.startsWith("Bearer ")) {
      const auth = await requireAuthUser(req);
      if (!("error" in auth)) {
        const { data: profile, error: profileError } = await service
          .from("user_profiles")
          .select("id, tenant_id")
          .eq("id", auth.user.id)
          .single();

        if (!profileError && profile?.tenant_id) {
          tenantId = profile.tenant_id as string;
          authUserId = profile.id as string;
        }
      }
    }

    // Unauthenticated checkout requires a valid enrolment token.
    if (!tenantId && !verifiedToken) {
      return jsonResponse({ error: "Valid enrolment token is required" }, 401);
    }

    if (verifiedToken) {
      tenantId = verifiedToken.tid;
      tokenEmail = verifiedToken.em.toLowerCase();
      if (verifiedToken.eid !== body.engagement_id) {
        return jsonResponse({ error: "Token does not match engagement" }, 403);
      }
    }

    // Fallback safety for auth path without token: tenant from pending engagement.
    if (!tenantId) {
      const { data: engagementForTenant, error: tenantLookupError } = await service
        .from("engagements")
        .select("tenant_id, status")
        .eq("id", body.engagement_id)
        .single();

      if (tenantLookupError || !engagementForTenant) {
        console.error("[create-checkout] engagement lookup failed", tenantLookupError);
        return jsonResponse({ error: "Engagement not found" }, 404);
      }

      if (engagementForTenant.status !== "pending_payment") {
        return jsonResponse({ error: "Engagement is not payable" }, 403);
      }

      tenantId = engagementForTenant.tenant_id as string;
    }

    const { data: engagement, error: engagementError } = await service
      .from("engagements")
      .select("id, tenant_id, person_id, offering_id, status, billing_account_id")
      .eq("id", body.engagement_id)
      .single();

    if (engagementError || !engagement) {
      return jsonResponse({ error: "Engagement not found" }, 404);
    }

    if (engagement.tenant_id !== tenantId || engagement.offering_id !== body.offering_id) {
      return jsonResponse({ error: "Engagement does not match tenant or offering" }, 403);
    }

    const { data: tenant, error: tenantError } = await service
      .from("tenants")
      .select("vat_rate, prices_include_vat, currency, payment_provider, payment_provider_public_key")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return jsonResponse({ error: "Tenant not found" }, 404);
    }

    // Paid enrolments (e.g. mock checkout already finalised) — let the UI continue.
    if (engagement.status !== "pending_payment") {
      if (engagement.status === "active" || engagement.status === "pending_waiver") {
        return jsonResponse({
          clientSecret: null,
          paymentIntentId: null,
          publishableKey: tenant.payment_provider_public_key,
          amountMinor: null,
          currency: (tenant.currency ?? "ILS").toUpperCase(),
          paymentProvider: tenant.payment_provider,
          mockCompleted: true,
          alreadyPaid: true,
        });
      }
      return jsonResponse({ error: "Engagement is not payable" }, 403);
    }

    if (!engagement.billing_account_id) {
      const billingAccountId = await ensureBillingAccountForStudent(
        service,
        engagement.tenant_id as string,
        engagement.person_id as string,
      );
      const { error: linkError } = await service
        .from("engagements")
        .update({ billing_account_id: billingAccountId })
        .eq("id", body.engagement_id);
      if (linkError) {
        console.error("[create-checkout] billing account link failed", linkError);
        return jsonResponse({ error: "Failed to link billing account" }, 500);
      }
      engagement.billing_account_id = billingAccountId;
    }

    if (!engagement.billing_account_id) {
      return jsonResponse({ error: "Engagement missing billing account" }, 400);
    }

    if (verifiedToken && verifiedToken.tid !== engagement.tenant_id) {
      return jsonResponse({ error: "Token tenant mismatch" }, 403);
    }

    if (verifiedToken) {
      const allowedEmails = await resolveAllowedTokenRecipientEmails(service, {
        tenantId: engagement.tenant_id as string,
        engagementId: engagement.id as string,
        personId: engagement.person_id as string,
      });
      if (!tokenEmail || !allowedEmails.has(tokenEmail)) {
        return jsonResponse({ error: "Token email mismatch" }, 403);
      }
    } else if (authUserId) {
      // Authenticated session without token must belong to same tenant.
      const { data: profile } = await service
        .from("user_profiles")
        .select("tenant_id")
        .eq("id", authUserId)
        .maybeSingle();
      if (!profile || profile.tenant_id !== engagement.tenant_id) {
        return jsonResponse({ error: "Unauthorized for engagement tenant" }, 403);
      }
    }

    const { data: offering, error: offeringError } = await service
      .from("offerings")
      .select("id, tenant_id, price_minor, currency, waiver_required")
      .eq("id", body.offering_id)
      .single();

    if (offeringError || !offering || offering.tenant_id !== tenantId) {
      return jsonResponse({ error: "Offering not found" }, 404);
    }

    // Waiver gating is enforced in the enrolment UI before checkout (parent/guest).
    // Admin in-person pay and pay-then-sign flows finalise to pending_waiver after payment.

    const pricing = resolveOfferingPrice(
      { price_minor: offering.price_minor as number },
      {
        vat_rate: Number(tenant.vat_rate ?? 0.17),
        prices_include_vat: tenant.prices_include_vat !== false,
      },
    );
    const pretaxMinor = pricing.pretaxMinor;
    const vatMinor = pricing.vatMinor;
    const totalMinor = pricing.totalMinor;
    const vatRate = pricing.vatRate;
    const currency = (offering.currency ?? tenant.currency ?? "ILS").toUpperCase();

    const provider = await getPaymentProviderForTenant(service, tenantId);
    const metadata = buildChargeMetadata({
      tenantId,
      engagementId: body.engagement_id,
      billingAccountId: engagement.billing_account_id as string,
      offeringId: body.offering_id,
      personId: engagement.person_id as string,
      vatRate,
      pretaxMinor,
      vatMinor,
      totalMinor,
      chargeType: "initial",
    });

    const result = await provider.createCharge({
      amountMinor: totalMinor,
      currency,
      idempotencyKey: `engagement-${body.engagement_id}-${totalMinor}-${currency}`,
      metadata,
    });

    if (result.emitSyncEvent) {
      await applyMockSyncEvent(service, result.emitSyncEvent);
    }

    return jsonResponse({
      clientSecret: result.clientSecret,
      paymentIntentId: result.providerPaymentRef,
      publishableKey: tenant.payment_provider_public_key,
      amountMinor: totalMinor,
      currency,
      paymentProvider: tenant.payment_provider,
      mockCompleted: Boolean(result.emitSyncEvent),
    });
  } catch (error) {
    console.error("[create-checkout]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});
