import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/supabase.ts";
import { resolveOfferingPrice } from "../_shared/email-dist/pricing.js";
import { extractWaiverToken, verifyWaiverToken } from "../_shared/waiver-token.ts";
import { engagementHasSignedWaiver } from "../_shared/engagement-waiver.ts";
import { resolveAllowedTokenRecipientEmails } from "../_shared/token-recipient.ts";

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
      .select("id, tenant_id, person_id, offering_id, status")
      .eq("id", body.engagement_id)
      .single();

    if (engagementError || !engagement) {
      return jsonResponse({ error: "Engagement not found" }, 404);
    }

    if (engagement.tenant_id !== tenantId || engagement.offering_id !== body.offering_id) {
      return jsonResponse({ error: "Engagement does not match tenant or offering" }, 403);
    }

    if (engagement.status !== "pending_payment") {
      return jsonResponse({ error: "Engagement is not payable" }, 403);
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

    if (offering.waiver_required) {
      const { satisfied } = await engagementHasSignedWaiver(service, body.engagement_id, tenantId, {
        requireActiveTemplateMatch: false,
      });
      if (!satisfied) {
        return jsonResponse({ error: "Waiver must be signed before payment" }, 403);
      }
    }

    const { data: tenant, error: tenantError } = await service
      .from("tenants")
      .select("vat_rate, prices_include_vat, currency")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      return jsonResponse({ error: "Tenant not found" }, 404);
    }

    const { data: credentials, error: credError } = await service.rpc(
      "get_tenant_stripe_credentials",
      { p_tenant_id: tenantId },
    );

    if (credError || !credentials?.[0]?.stripe_secret_key) {
      return jsonResponse({ error: "Stripe is not configured for this school" }, 503);
    }

    const cred = credentials[0] as {
      stripe_publishable_key: string | null;
      stripe_secret_key: string;
      stripe_webhook_secret: string | null;
    };

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
    const currency = (offering.currency ?? tenant.currency ?? "ILS").toLowerCase();

    const stripe = new Stripe(cred.stripe_secret_key, {
      apiVersion: "2023-10-16",
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalMinor,
      currency,
      metadata: {
        tenant_id: tenantId,
        engagement_id: body.engagement_id,
        offering_id: body.offering_id,
        person_id: engagement.person_id as string,
        vat_rate: String(vatRate),
        pretax_amount_minor: String(pretaxMinor),
        vat_amount_minor: String(vatMinor),
        total_amount_minor: String(totalMinor),
        prices_include_vat: String(tenant.prices_include_vat !== false),
      },
      automatic_payment_methods: { enabled: true },
    }, {
      idempotencyKey: `engagement-${body.engagement_id}-${totalMinor}-${currency}`,
    });

    return jsonResponse({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      publishableKey: cred.stripe_publishable_key,
      amountMinor: totalMinor,
      currency: currency.toUpperCase(),
    });
  } catch (error) {
    console.error("[create-checkout]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});
