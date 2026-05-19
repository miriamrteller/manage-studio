import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse({ error: "Missing stripe-signature" }, 400);
  }

  const rawBody = await req.text();

  try {
    const service = createServiceClient();

    let event: Stripe.Event;
    let tenantId: string | undefined;

    const unverified = JSON.parse(rawBody) as Stripe.Event;
    const paymentObject = unverified.data?.object as Stripe.PaymentIntent | undefined;
    tenantId = paymentObject?.metadata?.tenant_id;

    if (!tenantId) {
      console.error("[stripe-webhook] missing metadata.tenant_id");
      return jsonResponse({ error: "Missing tenant_id in metadata" }, 400);
    }

    const { data: credentials, error: credError } = await service.rpc(
      "get_tenant_stripe_credentials",
      { p_tenant_id: tenantId },
    );

    if (credError || !credentials?.[0]?.stripe_webhook_secret) {
      return jsonResponse({ error: "Webhook secret not configured" }, 503);
    }

    const webhookSecret = (credentials[0] as { stripe_webhook_secret: string })
      .stripe_webhook_secret;
    const stripeSecret = (credentials[0] as { stripe_secret_key: string })
      .stripe_secret_key;

    const stripe = new Stripe(stripeSecret, { apiVersion: "2023-10-16" });
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    const intent = event.data.object as Stripe.PaymentIntent;
    const enrolmentId = intent.metadata?.enrolment_id;
    const metadataTenantId = intent.metadata?.tenant_id;

    if (!metadataTenantId || metadataTenantId !== tenantId) {
      return jsonResponse({ error: "Tenant metadata mismatch" }, 400);
    }

    if (event.type === "payment_intent.succeeded") {
      if (!enrolmentId) {
        return jsonResponse({ error: "Missing enrolment_id in metadata" }, 400);
      }

      const { data: existing } = await service
        .from("payments")
        .select("id")
        .eq("stripe_payment_intent_id", intent.id)
        .maybeSingle();

      if (existing) {
        return jsonResponse({ received: true, duplicate: true });
      }

      const { data: enrolment } = await service
        .from("enrolments")
        .select("id, tenant_id, person_id")
        .eq("id", enrolmentId)
        .single();

      if (!enrolment) {
        return jsonResponse({ error: "Enrolment not found" }, 404);
      }

      const { data: person } = await service
        .from("people")
        .select("family_id")
        .eq("id", enrolment.person_id)
        .single();

      const { data: invoiceNumber, error: invoiceError } = await service.rpc(
        "next_invoice_number",
        { p_tenant_id: tenantId },
      );

      if (invoiceError) {
        throw invoiceError;
      }

      const amountReceived = intent.amount_received ?? intent.amount;
      const vatRate = Number(intent.metadata?.vat_rate ?? 0.17);
      const pretax = Number(intent.metadata?.pretax_amount_minor) ||
        Math.round(amountReceived / (1 + vatRate));
      const vatMinor = Number(intent.metadata?.vat_amount_minor) ||
        amountReceived - pretax;

      await service.from("payments").insert({
        tenant_id: tenantId,
        family_id: person?.family_id ?? null,
        person_id: enrolment.person_id,
        enrolment_id: enrolmentId,
        stripe_payment_intent_id: intent.id,
        pretax_amount_minor: pretax,
        vat_rate: vatRate,
        vat_amount_minor: vatMinor,
        total_amount_minor: amountReceived,
        currency: intent.currency.toUpperCase(),
        invoice_number: invoiceNumber,
        invoice_issued_at: new Date().toISOString(),
        status: "succeeded",
        paid_at: new Date().toISOString(),
        description: `Enrolment ${enrolmentId}`,
      });

      await service
        .from("enrolments")
        .update({
          status: "active",
          payment_received_at: new Date().toISOString(),
        })
        .eq("id", enrolmentId);

      await service.from("audit_log").insert({
        tenant_id: tenantId,
        action: "payment.succeeded",
        entity_type: "payment",
        entity_id: enrolmentId,
        after_state: { stripe_payment_intent_id: intent.id, status: "succeeded" },
      });
    } else if (event.type === "payment_intent.payment_failed") {
      if (enrolmentId) {
        await service.from("audit_log").insert({
          tenant_id: tenantId,
          action: "payment.failed",
          entity_type: "payment",
          entity_id: enrolmentId,
          after_state: {
            stripe_payment_intent_id: intent.id,
            last_payment_error: intent.last_payment_error?.message,
          },
        });
      }
    }

    return jsonResponse({ received: true });
  } catch (error) {
    console.error("[stripe-webhook]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Webhook error" },
      400,
    );
  }
});
