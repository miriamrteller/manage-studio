import { z } from "npm:zod@3.22.4";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { parseLeadEmail } from "../_shared/crm-contract/parse-lead-email.ts";
import {
  LEAD_TENANT_COLUMNS,
  type LeadTenant,
  notifyTenantOfLead,
  writeInboundLead,
} from "../_shared/crm-contract/lead-ingest-core.ts";

/**
 * crm-lead-ingest — write path for automated lead capture from EMAIL
 * (phase 2b; docs/plans/crm-lead-capture-channels.md).
 *
 * Called by the Cloudflare Email Worker (workers/lead-email-ingest) whenever
 * an inquiry lands on a leads-<subdomain>@opalswift.com address. Creates or
 * refreshes a row in `leads` via the shared lead-ingest-core (dedupe rules +
 * studio notification live there); never touches people/accounts.
 *
 * Auth: `Authorization: Bearer <CRM_INGEST_SECRET>` — machine-to-machine,
 * same shape as the CRON_SECRET functions but FAIL-CLOSED: with no secret
 * configured the function refuses every request instead of allowing them
 * (this endpoint writes and is internet-reachable).
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
      .select(LEAD_TENANT_COLUMNS)
      .eq("subdomain", payload.tenantSubdomain)
      .single();
    if (tenantError || !tenant) {
      console.error("crm-lead-ingest: unknown tenant", payload.tenantSubdomain);
      return json({ error: "Unknown tenant" }, 404);
    }

    const fields = parseLeadEmail(payload.message);
    const result = await writeInboundLead(service, tenant as LeadTenant, fields, {
      channel: "email",
      sourceRef: payload.message.messageId,
      receivedAt: payload.message.receivedAt ?? new Date().toISOString(),
    });

    if (result.outcome !== "duplicate") {
      await notifyTenantOfLead(service, tenant as LeadTenant, fields, result.outcome);
    }

    return json(
      { outcome: result.outcome, leadId: result.leadId },
      result.outcome === "created" ? 201 : 200,
    );
  } catch (err) {
    console.error("crm-lead-ingest: unhandled error", err);
    return json({ error: "Internal error" }, 500);
  }
});
