import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { z } from "npm:zod@4.6.7";

/**
 * Finance -> Payments -> "Record a payment" when it isn't linked to an enrolment, monthly plan,
 * project payment or booking (those go through their own paths so they land in the same place).
 * Who paid: a client of the studio, or someone not in the list, who is then added as a client
 * with the typed name (a payment always has a payer: payments.payment_payer). What it's for: an
 * offering the studio sells (linked by offering_id), or "Other" with a note. Documents and the
 * "not a tax document" confirmation follow as for any manual payment.
 */
export const StandalonePaymentSchema = z
  .object({
    person_id: z.string().guid().optional(),
    new_person: z
      .object({
        name: z.string().trim().min(1).max(200),
        email: z.string().trim().toLowerCase().email().optional(),
      })
      .optional(),
    offering_id: z.string().guid().optional(),
    amount_minor: z.number().int().positive(),
    method: z.enum(["cash", "bank_transfer", "bit"]),
    note: z.string().max(500).optional(),
    paid_on: z.string().optional(),
    send_confirmation: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.person_id) !== Boolean(v.new_person), {
    message: "Choose who paid",
    path: ["person_id"],
  });
export type StandalonePaymentInput = z.infer<typeof StandalonePaymentSchema>;

const METHOD_TEXT: Record<StandalonePaymentInput["method"], string> = {
  cash: "cash",
  bank_transfer: "bank transfer",
  bit: "Bit / PayBox",
};

/** Pure: the payment row for a standalone manual payment. */
export function standalonePaymentRow(input: {
  tenantId: string;
  personId: string;
  accountId: string | null;
  offering: { id: string; name: string } | null;
  amountMinor: number;
  currency: string;
  method: StandalonePaymentInput["method"];
  note?: string;
  paidAt: string;
  actorUserId: string;
  ref: string;
}) {
  const note = input.note?.trim();
  return {
    tenant_id: input.tenantId,
    account_id: input.accountId,
    person_id: input.personId,
    offering_id: input.offering?.id ?? null,
    engagement_id: null,
    billing_account_id: null,
    charge_type: "initial",
    provider: "manual",
    provider_payment_ref: input.ref,
    payment_method: input.method,
    pretax_amount_minor: 0,
    vat_rate: 0,
    vat_amount_minor: 0,
    total_amount_minor: input.amountMinor,
    currency: input.currency.toUpperCase(),
    status: "succeeded",
    paid_at: input.paidAt,
    description: note || [input.offering?.name, `manual ${METHOD_TEXT[input.method]}`].filter(Boolean).join(" — "),
    created_by: input.actorUserId,
    approved_by: input.actorUserId,
  };
}

export type StandaloneResult =
  | { ok: true; paymentId: string; personId: string }
  | { ok: false; status: number; error: string };

/** Records the payment (and the new client, when needed). Documents are queued by the caller. */
export async function recordStandalonePayment(
  service: SupabaseClient,
  params: { tenantId: string; actorUserId: string; body: StandalonePaymentInput; paidAt: string },
): Promise<StandaloneResult> {
  const { tenantId, body } = params;

  let personId = body.person_id ?? null;
  let accountId: string | null = null;
  if (personId) {
    const { data: person } = await service
      .from("people")
      .select("id, tenant_id, account_id")
      .eq("id", personId)
      .maybeSingle();
    if (!person || person.tenant_id !== tenantId) return { ok: false, status: 404, error: "Client not found" };
    accountId = (person.account_id as string | null) ?? null;
  } else if (body.new_person) {
    const { data: created, error } = await service
      .from("people")
      .insert({ tenant_id: tenantId, name: body.new_person.name, email: body.new_person.email ?? null })
      .select("id")
      .single();
    if (error || !created) return { ok: false, status: 500, error: error?.message ?? "Could not add the client" };
    personId = created.id as string;
    await service.from("audit_log").insert({
      tenant_id: tenantId,
      action: "CREATE",
      entity_type: "people",
      entity_id: personId,
      actor_id: params.actorUserId,
      after_state: { name: body.new_person.name, source: "record_payment" },
    });
  }
  if (!personId) return { ok: false, status: 400, error: "Choose who paid" };

  let offering: { id: string; name: string; currency: string | null } | null = null;
  if (body.offering_id) {
    const { data } = await service
      .from("offerings")
      .select("id, tenant_id, name, currency")
      .eq("id", body.offering_id)
      .maybeSingle();
    if (!data || data.tenant_id !== tenantId) return { ok: false, status: 404, error: "Offering not found" };
    offering = { id: data.id as string, name: data.name as string, currency: (data.currency as string | null) ?? null };
  }

  const { data: tenant } = await service.from("tenants").select("currency").eq("id", tenantId).single();

  const row = standalonePaymentRow({
    tenantId,
    personId,
    accountId,
    offering,
    amountMinor: body.amount_minor,
    currency: offering?.currency ?? (tenant?.currency as string | null) ?? "ILS",
    method: body.method,
    note: body.note,
    paidAt: params.paidAt,
    actorUserId: params.actorUserId,
    ref: `manual_standalone_${personId}_${Date.now()}`,
  });
  const { data: payment, error: insertError } = await service.from("payments").insert(row).select("id").single();
  if (insertError || !payment) return { ok: false, status: 500, error: insertError?.message ?? "Insert failed" };

  await service.from("audit_log").insert({
    tenant_id: tenantId,
    action: "manual_payment_recorded",
    entity_type: "payment",
    entity_id: payment.id,
    actor_id: params.actorUserId,
    after_state: {
      standalone: true,
      person_id: personId,
      offering_id: offering?.id ?? null,
      method: body.method,
      amount_minor: body.amount_minor,
    },
  });

  return { ok: true, paymentId: payment.id as string, personId };
}
