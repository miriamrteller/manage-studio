import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";
import { ChargeMetadataSchema } from "../types.ts";

export class StripePaymentProvider implements PaymentProvider {
  readonly slug = "stripe";

  constructor(private readonly service: SupabaseClient) {}

  private async getStripe(tenantId: string): Promise<{
    stripe: Stripe;
    publicKey: string | null;
  }> {
    const { data: credentials, error } = await this.service.rpc(
      "get_tenant_payment_credentials",
      { p_tenant_id: tenantId },
    );
    if (error || !credentials?.[0]?.payment_provider_secret_key) {
      throw new Error("Payment provider secret not configured");
    }
    const cred = credentials[0] as {
      payment_provider_public_key: string | null;
      payment_provider_secret_key: string;
    };
    return {
      stripe: new Stripe(cred.payment_provider_secret_key, { apiVersion: "2023-10-16" }),
      publicKey: cred.payment_provider_public_key,
    };
  }

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    const tenantId = params.metadata.tenant_id;
    const { stripe, publicKey } = await this.getStripe(tenantId);

    const intent = await stripe.paymentIntents.create(
      {
        amount: params.amountMinor,
        currency: params.currency.toLowerCase(),
        customer: params.customerRef,
        metadata: {
          tenant_id: params.metadata.tenant_id,
          engagement_id: params.metadata.engagement_id,
          billing_account_id: params.metadata.billing_account_id,
          charge_type: params.metadata.charge_type,
          ...(params.metadata.billing_schedule_id
            ? { billing_schedule_id: params.metadata.billing_schedule_id }
            : {}),
          ...(params.metadata.offering_id ? { offering_id: params.metadata.offering_id } : {}),
          ...(params.metadata.person_id ? { person_id: params.metadata.person_id } : {}),
          vat_rate: params.metadata.vat_rate ?? "0.17",
          pretax_amount_minor: params.metadata.pretax_amount_minor ?? String(params.amountMinor),
          vat_amount_minor: params.metadata.vat_amount_minor ?? "0",
          total_amount_minor: params.metadata.total_amount_minor ?? String(params.amountMinor),
        },
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: params.idempotencyKey },
    );

    return {
      clientSecret: intent.client_secret ?? undefined,
      providerPaymentRef: intent.id,
      customerRef: typeof intent.customer === "string" ? intent.customer : params.customerRef,
      ...(publicKey ? {} : {}),
    };
  }

  async constructEvent(
    rawBody: string,
    headers: Headers,
    tenantId: string,
  ): Promise<PaymentEvent> {
    const signature = headers.get("stripe-signature");
    if (!signature) {
      throw new Error("Missing stripe-signature");
    }

    const { data: credentials, error } = await this.service.rpc(
      "get_tenant_payment_credentials",
      { p_tenant_id: tenantId },
    );
    if (error || !credentials?.[0]?.payment_provider_webhook_secret) {
      throw new Error("Webhook secret not configured");
    }

    const webhookSecret = (credentials[0] as { payment_provider_webhook_secret: string })
      .payment_provider_webhook_secret;
    const stripeSecret = (credentials[0] as { payment_provider_secret_key: string })
      .payment_provider_secret_key;

    const stripe = new Stripe(stripeSecret, { apiVersion: "2023-10-16" });
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    const intent = event.data.object as Stripe.PaymentIntent;

    const metadata = ChargeMetadataSchema.parse({
      tenant_id: intent.metadata.tenant_id,
      engagement_id: intent.metadata.engagement_id,
      billing_account_id: intent.metadata.billing_account_id,
      charge_type: intent.metadata.charge_type ?? "initial",
      billing_schedule_id: intent.metadata.billing_schedule_id,
      offering_id: intent.metadata.offering_id,
      person_id: intent.metadata.person_id,
      vat_rate: intent.metadata.vat_rate,
      pretax_amount_minor: intent.metadata.pretax_amount_minor,
      vat_amount_minor: intent.metadata.vat_amount_minor,
      total_amount_minor: intent.metadata.total_amount_minor,
    });

    const amountReceived = intent.amount_received ?? intent.amount;
    const vatRate = Number(metadata.vat_rate ?? 0.17);
    const pretax = Number(metadata.pretax_amount_minor) ||
      Math.round(amountReceived / (1 + vatRate));
    const vatMinor = Number(metadata.vat_amount_minor) || amountReceived - pretax;

    if (event.type === "payment_intent.succeeded") {
      return {
        type: "payment.succeeded",
        providerPaymentRef: intent.id,
        metadata,
        amountMinor: amountReceived,
        currency: intent.currency,
        pretaxAmountMinor: pretax,
        vatAmountMinor: vatMinor,
        vatRate,
        offeringId: metadata.offering_id,
        personId: metadata.person_id,
      };
    }

    if (event.type === "payment_intent.payment_failed") {
      return {
        type: "payment.failed",
        providerPaymentRef: intent.id,
        metadata,
        amountMinor: amountReceived,
        currency: intent.currency,
        pretaxAmountMinor: pretax,
        vatAmountMinor: vatMinor,
        vatRate,
        failureMessage: intent.last_payment_error?.message,
      };
    }

    throw new Error(`Unhandled Stripe event type: ${event.type}`);
  }
}
