import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/supabase.ts";

interface CreatePaymentIntentBody {
  class_id: string;
  enrolment_id: string;
}

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const auth = await requireAuthUser(req);
    if ("error" in auth) {
      return jsonResponse({ error: auth.error }, auth.status);
    }

    const body = (await req.json()) as CreatePaymentIntentBody;
    if (!body.class_id || !body.enrolment_id) {
      return jsonResponse({ error: "class_id and enrolment_id are required" }, 400);
    }

    const service = createServiceClient();

    const { data: profile, error: profileError } = await service
      .from("user_profiles")
      .select("tenant_id")
      .eq("id", auth.user.id)
      .single();

    if (profileError || !profile?.tenant_id) {
      return jsonResponse({ error: "User profile not found" }, 403);
    }

    const tenantId = profile.tenant_id as string;

    const { data: enrolment, error: enrolmentError } = await service
      .from("enrolments")
      .select("id, tenant_id, person_id, class_id, status")
      .eq("id", body.enrolment_id)
      .single();

    if (enrolmentError || !enrolment) {
      return jsonResponse({ error: "Enrolment not found" }, 404);
    }

    if (enrolment.tenant_id !== tenantId || enrolment.class_id !== body.class_id) {
      return jsonResponse({ error: "Enrolment does not match tenant or class" }, 403);
    }

    const { data: classRow, error: classError } = await service
      .from("classes")
      .select("id, tenant_id, price_minor, currency, vat_rate")
      .eq("id", body.class_id)
      .single();

    if (classError || !classRow || classRow.tenant_id !== tenantId) {
      return jsonResponse({ error: "Class not found" }, 404);
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

    const pretaxMinor = classRow.price_minor as number;
    const vatRate = Number(classRow.vat_rate ?? tenant.vat_rate ?? 0.17);
    const vatMinor = Math.round(pretaxMinor * vatRate);
    const totalMinor = pretaxMinor + vatMinor;
    const currency = (classRow.currency ?? tenant.currency ?? "ILS").toLowerCase();

    const stripe = new Stripe(cred.stripe_secret_key, {
      apiVersion: "2023-10-16",
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalMinor,
      currency,
      metadata: {
        tenant_id: tenantId,
        enrolment_id: body.enrolment_id,
        class_id: body.class_id,
        person_id: enrolment.person_id as string,
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
    console.error("[create-payment-intent]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});
