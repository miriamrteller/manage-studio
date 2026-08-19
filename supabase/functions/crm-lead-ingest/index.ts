import { z } from "npm:zod@3.22.4";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { parseLeadEmail } from "../_shared/crm-contract/parse-lead-email.ts";

/**
 * crm-lead-ingest — write path for automated lead capture (phase 2b).
 *
 * Called by the Cloudflare Email Worker (workers/lead-email-ingest) whenever
 * an inquiry lands on a leads-<subdomain>@opalswift.com address. Creates or
 * refreshes a row in `leads`; never touches people/accounts.
 *
 * Auth: `Authorization: Bearer <CRM_INGEST_SECRET>` — machine-to-machine,
 * same shape as the CRON_SECRET functions but FAIL-CLOSED: with no secret
 * configured the function refuses every request instead of allowing them
 * (this endpoint writes and is internet-reachable).
 *
 * Idempotency & dedupe, in order:
 *   1. same (tenant, source_ref)            → duplicate delivery, no-op
 *   2. open lead with the same email        → touchpoint: update
 *      (open = not converted, stage != lost)  last_contacted_at + note snippet
 *   3. otherwise                            → new lead (stage new, channel
 *                                             email, marketing_consent false)
 */

const payloadSchema = z.object({
  tenantSubdomain: z.string().min(1),
  message: z.object({
    messageId: z.string().min(1),
    fromName: z.string().nullable(),
    fromEmail: z.string().nullable(),
    subject: z.string().nullable(),
    text: z.string().nullable(),
    receivedAt: z.string().datetime({ offset: true }).nullable(),
  }),
});

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const secret = Deno.env.get("CRM_INGEST_SECRET");
  if (!secret) {
    console.error("crm-lead-ingest: CRM_INGEST_SECRET is not configured — refusing");
    return json({ error: "Ingest not configured" }, 503);
  }
  if (req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch (err) {
    console.error("crm-lead-ingest: invalid payload", err);
    return json({ error: "Invalid payload" }, 400);
  }

  try {
    const service = createServiceClient();

    const { data: tenant, error: tenantError } = await service
      .from("tenants")
      .select("id")
      .eq("subdomain", payload.tenantSubdomain)
      .single();
    if (tenantError || !tenant) {
      console.error("crm-lead-ingest: unknown tenant", payload.tenantSubdomain);
      return json({ error: "Unknown tenant" }, 404);
    }
    const tenantId = tenant.id as string;

    const receivedAt = payload.message.receivedAt ?? new Date().toISOString();
    const fields = parseLeadEmail(payload.message);

    // 1. Duplicate delivery of the same message.
    const { data: existing } = await service
      .from("leads")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("source_ref", payload.message.messageId)
      .maybeSingle();
    if (existing) {
      return json({ outcome: "duplicate", leadId: existing.id });
    }

    // 2. A new email from an already-open lead is a touchpoint, not a new lead.
    if (fields.email) {
      const { data: open } = await service
        .from("leads")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("email", fields.email)
        .neq("stage", "lost")
        .is("converted_account_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (open) {
        const { error: updateError } = await service
          .from("leads")
          .update({
            last_contacted_at: receivedAt,
            last_communication_note: fields.lastCommunicationNote,
          })
          .eq("id", open.id)
          .eq("tenant_id", tenantId);
        if (updateError) throw updateError;
        return json({ outcome: "updated", leadId: open.id });
      }
    }

    // 3. New lead.
    const { data: created, error: insertError } = await service
      .from("leads")
      .insert({
        tenant_id: tenantId,
        name: fields.name,
        email: fields.email,
        phone: fields.phone,
        stage: "new",
        channel: "email",
        interest: fields.interest,
        last_contacted_at: receivedAt,
        last_communication_note: fields.lastCommunicationNote,
        marketing_consent: false,
        source_ref: payload.message.messageId,
      })
      .select("id")
      .single();
    if (insertError) {
      // Unique (tenant, source_ref) race: another delivery won — treat as duplicate.
      if ((insertError as { code?: string }).code === "23505") {
        return json({ outcome: "duplicate" });
      }
      throw insertError;
    }

    return json({ outcome: "created", leadId: created.id }, 201);
  } catch (err) {
    console.error("crm-lead-ingest: unhandled error", err);
    return json({ error: "Internal error" }, 500);
  }
});
