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
    const engagementId = intent.metadata?.engagement_id;
    const offeringId = intent.metadata?.offering_id;
    const metadataTenantId = intent.metadata?.tenant_id;

    if (!metadataTenantId || metadataTenantId !== tenantId) {
      return jsonResponse({ error: "Tenant metadata mismatch" }, 400);
    }

    if (event.type === "payment_intent.succeeded") {
      if (!engagementId) {
        return jsonResponse({ error: "Missing engagement_id in metadata" }, 400);
      }

      const { data: existing } = await service
        .from("payments")
        .select("id")
        .eq("stripe_payment_intent_id", intent.id)
        .maybeSingle();

      if (existing) {
        return jsonResponse({ received: true, duplicate: true });
      }

      const { data: engagement } = await service
        .from("engagements")
        .select("id, tenant_id, person_id, offering_id")
        .eq("id", engagementId)
        .single();

      if (!engagement) {
        return jsonResponse({ error: "Engagement not found" }, 404);
      }

      const { data: person } = await service
        .from("people")
        .select("account_id")
        .eq("id", engagement.person_id)
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
        account_id: person?.account_id ?? null,
        person_id: engagement.person_id,
        offering_id: offeringId ?? engagement.offering_id,
        engagement_id: engagementId,
        charge_type: "initial",
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
        description: `Engagement ${engagementId}`,
      });

      // Waiver gate: if the offering requires a waiver and no signed evidence exists,
      // set the engagement to pending_waiver instead of active.
      let engagementStatus = "active";
      const { data: offeringRow } = await service
        .from("offerings")
        .select("waiver_required")
        .eq("id", engagement.offering_id)
        .single();
      if (offeringRow?.waiver_required) {
        const { data: waiverTemplate } = await service
          .from("consent_templates")
          .select("id, version")
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .maybeSingle();
        if (waiverTemplate) {
          const { data: evidence } = await service
            .from("waiver_evidence")
            .select("id")
            .eq("person_id", engagement.person_id)
            .eq("consent_template_id", waiverTemplate.id)
            .eq("consent_version", waiverTemplate.version)
            .eq("status", "signed")
            .maybeSingle();
          if (!evidence) {
            engagementStatus = "pending_waiver";
            console.warn(
              "[stripe-webhook] Engagement set to pending_waiver — waiver not yet signed",
              { engagementId, personId: engagement.person_id },
            );
          }
        }
      }

      await service
        .from("engagements")
        .update({
          status: engagementStatus,
          payment_received_at: new Date().toISOString(),
        })
        .eq("id", engagementId);

      await service.from("audit_log").insert({
        tenant_id: tenantId,
        action: "payment.succeeded",
        entity_type: "payment",
        entity_id: engagementId,
        after_state: { stripe_payment_intent_id: intent.id, status: "succeeded" },
      });
    } else if (event.type === "payment_intent.payment_failed") {
      if (engagementId) {
        await service.from("audit_log").insert({
          tenant_id: tenantId,
          action: "payment.failed",
          entity_type: "payment",
          entity_id: engagementId,
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
