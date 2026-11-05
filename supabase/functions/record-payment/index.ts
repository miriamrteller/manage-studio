import { z } from "npm:zod@4.6.7";
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { resolveOfferingPrice } from "../_shared/email-dist/pricing.js";
import { finalisePayment } from "../_shared/payments/finalise-payment.ts";
import { recordManualRenewal } from "../_shared/payments/record-manual-renewal.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { sendNoDocumentPaymentConfirmation } from "../_shared/payments/send-payment-confirmation-email.ts";
import { paidAtFor } from "../_shared/payments/paid-on.ts";
import { recordStandalonePayment, StandalonePaymentSchema } from "../_shared/payments/record-standalone-payment.ts";
import { enqueueDocument } from "../_shared/enqueue-document.ts";

const RecordPaymentBodySchema = z.object({
  engagement_id: z.string().guid(),
  method: z.enum(["cash", "bank_transfer", "bit"]),
  amount_minor: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
  /** Email the payer a "not a tax document" confirmation (invoicing "none" only). Default on. */
  send_confirmation: z.boolean().optional(),
  /** YYYY-MM-DD the money was received; defaults to today. */
  paid_on: z.string().optional(),
});

/** A plain "not a tax document" confirmation for studios with no invoicing; never fails the request. */
async function confirmToPayer(service: Parameters<typeof sendNoDocumentPaymentConfirmation>[0], tenantId: string, paymentId: string, wanted: boolean | undefined) {
  if (wanted === false) return;
  try {
    await sendNoDocumentPaymentConfirmation(service, { tenantId, paymentId });
  } catch (err) {
    console.error("[confirmToPayer] failed", paymentId, err);
  }
}

Deno.serve(withMonitoring("record-payment", async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await requireAuthUser(req);
  if ("error" in auth) {
    return jsonResponse({ error: auth.error }, auth.status);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }
  // Linked to an enrolment / monthly plan / booking (engagement_id), or a standalone payment
  // from Finance -> Payments (who paid + what it's for).
  const linked = RecordPaymentBodySchema.safeParse(raw);
  const standalone = linked.success ? null : StandalonePaymentSchema.safeParse(raw);
  if (!linked.success && !standalone?.success) {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }
  const paidOn = linked.success ? linked.data.paid_on : standalone?.success ? standalone.data.paid_on : undefined;
  const paid = paidAtFor(paidOn);
  if (!paid.ok) return jsonResponse({ error: paid.error }, 400);

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();

  if (!profile?.tenant_id || !Array.isArray(profile.role) || !profile.role.includes("tenant_admin")) {
    return jsonResponse({ error: "tenant_admin role required" }, 403);
  }

  const tenantId = profile.tenant_id as string;

  if (!linked.success) {
    const input = standalone?.success ? standalone.data : null;
    if (!input) return jsonResponse({ error: "Invalid request body" }, 400);
    const result = await recordStandalonePayment(service, {
      tenantId,
      actorUserId: auth.user.id,
      body: input,
      paidAt: paid.paidAt,
    });
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    // Offline money still gets its receipt from the studio's invoicing service, where it can.
    await enqueueDocument(service, { tenantId, paymentId: result.paymentId, documentKind: "sale" });
    await confirmToPayer(service, tenantId, result.paymentId, input.send_confirmation);
    return jsonResponse({ ok: true, paymentId: result.paymentId, personId: result.personId });
  }
  const body = linked.data;

  const { data: engagement, error: engagementError } = await service
    .from("engagements")
    .select("id, tenant_id, person_id, offering_id, billing_account_id, status")
    .eq("id", body.engagement_id)
    .single();

  if (engagementError || !engagement || engagement.tenant_id !== tenantId) {
    return jsonResponse({ error: "Engagement not found" }, 404);
  }

  // An active enrolment on a monthly plan: record that month's fee paid at the studio.
  if (engagement.status === "active") {
    const result = await recordManualRenewal(service, {
      tenantId,
      engagement: {
        id: engagement.id as string,
        person_id: engagement.person_id as string,
        offering_id: engagement.offering_id as string,
        billing_account_id: engagement.billing_account_id as string | null,
      },
      method: body.method,
      amountMinor: body.amount_minor,
      note: body.note,
      paidAt: paid.paidAt,
      actorUserId: auth.user.id,
    }, {
      finalise: finalisePayment,
      priceMinor: (priceMinor) => resolveOfferingPrice({ price_minor: priceMinor }).totalMinor,
    });
    if (!result.ok) return jsonResponse({ error: result.error, code: result.code }, result.status);
    await confirmToPayer(service, tenantId, result.paymentId, body.send_confirmation);
    return jsonResponse({ ok: true, paymentId: result.paymentId, period: result.period });
  }

  if (engagement.status !== "pending_payment") {
    return jsonResponse({ error: "Engagement is not pending payment" }, 409);
  }

  if (!engagement.billing_account_id) {
    return jsonResponse({ error: "Engagement missing billing account" }, 400);
  }

  const { data: existingPayment } = await service
    .from("payments")
    .select("id")
    .eq("engagement_id", body.engagement_id)
    .eq("status", "succeeded")
    .maybeSingle();

  if (existingPayment) {
    return jsonResponse({ error: "Payment already recorded" }, 409);
  }

  const [{ data: offering }, { data: tenant }] = await Promise.all([
    service.from("offerings").select("price_minor, currency").eq("id", engagement.offering_id).single(),
    service.from("tenants").select("currency").eq("id", tenantId).single(),
  ]);

  if (!offering || !tenant) {
    return jsonResponse({ error: "Offering or tenant not found" }, 404);
  }

  const pricing = resolveOfferingPrice({ price_minor: offering.price_minor as number });

  const totalMinor = body.amount_minor ?? pricing.totalMinor;

  const { data: person } = await service
    .from("people")
    .select("account_id")
    .eq("id", engagement.person_id)
    .single();

  const manualRef = `manual_${body.engagement_id}_${Date.now()}`;

  const { data: paymentRow, error: insertError } = await service
    .from("payments")
    .insert({
      tenant_id: tenantId,
      account_id: person?.account_id ?? null,
      person_id: engagement.person_id,
      offering_id: engagement.offering_id,
      engagement_id: body.engagement_id,
      billing_account_id: engagement.billing_account_id,
      charge_type: "initial",
      provider: "manual",
      provider_payment_ref: manualRef,
      payment_method: body.method,
      pretax_amount_minor: 0,
      vat_rate: 0,
      vat_amount_minor: 0,
      total_amount_minor: totalMinor,
      currency: (offering.currency ?? tenant.currency ?? "ILS").toUpperCase(),
      status: "succeeded",
      paid_at: paid.paidAt,
      description: body.note ?? `Manual ${body.method} payment`,
      created_by: auth.user.id,
      approved_by: auth.user.id,
    })
    .select("id, engagement_id, charge_type")
    .single();

  if (insertError || !paymentRow) {
    return jsonResponse({ error: insertError?.message ?? "Insert failed" }, 500);
  }

  // Who recorded what amount, against the class price (the admin may enter a different one).
  await service.from("audit_log").insert({
    tenant_id: tenantId,
    action: "manual_payment_recorded",
    entity_type: "payment",
    entity_id: paymentRow.id,
    actor_id: auth.user.id,
    after_state: {
      engagement_id: body.engagement_id,
      method: body.method,
      amount_minor: totalMinor,
      class_price_minor: pricing.totalMinor,
      amount_changed: totalMinor !== pricing.totalMinor,
    },
  });

  await finalisePayment(service, {
    tenantId,
    paymentRow: paymentRow as { id: string; engagement_id: string | null; charge_type: string },
    engagementId: body.engagement_id,
    chargeType: "initial",
    actorUserId: auth.user.id,
  });

  await confirmToPayer(service, tenantId, paymentRow.id as string, body.send_confirmation);
  return jsonResponse({ ok: true, paymentId: paymentRow.id });
}));
