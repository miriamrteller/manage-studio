import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/supabase.ts";

interface CreateCheckoutBody {
  offering_id: string;
  engagement_id: string;
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
    const authHeader = req.headers.get("Authorization");
    let tenantId: string;

    if (authHeader?.startsWith("Bearer ")) {
      const auth = await requireAuthUser(req);
      if ("error" in auth) {
        return jsonResponse({ error: auth.error }, auth.status);
      }

      const { data: profile, error: profileError } = await service
        .from("user_profiles")
        .select("tenant_id")
        .eq("id", auth.user.id)
        .single();

      if (profileError || !profile?.tenant_id) {
        return jsonResponse({ error: "User profile not found" }, 403);
      }

      tenantId = profile.tenant_id as string;
    } else {
      const { data: engagementForTenant, error: tenantLookupError } = await service
        .from("engagements")
        .select("tenant_id, status")
        .eq("id", body.engagement_id)
        .single();

      if (tenantLookupError || !engagementForTenant) {
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

    const { data: offering, error: offeringError } = await service
      .from("offerings")
      .select("id, tenant_id, price_minor, currency")
      .eq("id", body.offering_id)
      .single();

    if (offeringError || !offering || offering.tenant_id !== tenantId) {
      return jsonResponse({ error: "Offering not found" }, 404);
    }

    const { data: tenant, error: tenantError } = await service
      .from("tenants")
      .select("vat_rate, currency")
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

    const pretaxMinor = offering.price_minor as number;
    const vatRate = Number(tenant.vat_rate ?? 0.17);
    const vatMinor = Math.round(pretaxMinor * vatRate);
    const totalMinor = pretaxMinor + vatMinor;
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
      },
      automatic_payment_methods: { enabled: true },
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
