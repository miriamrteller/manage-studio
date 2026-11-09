import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { type IngestPayload, leadFromPayload, payloadSchema } from "./payload.ts";
import {
  LEAD_TENANT_COLUMNS,
  type LeadTenant,
  notifyTenantOfLead,
  writeInboundLead,
} from "../_shared/crm-contract/lead-ingest-core.ts";
import { assessLeadSpam } from "../_shared/crm-contract/lead-spam.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

/**
 * crm-lead-ingest — server-to-server write path for automated lead capture
 * (phase 2b; docs/plans/crm-lead-capture-channels.md). Two callers:
 *   - EMAIL: the Cloudflare Email Worker (workers/lead-email-ingest), whenever
 *     an inquiry lands on a leads-<subdomain>@opalswift.com address
 *     (`message`, channel email).
 *   - WEBSITE: the opalswift.com contact form (apps/marketing/functions/api/
 *     contact.js) files each enquiry in the hq studio's Leads (`contact`,
 *     channel website; docs/plans/OPALSWIFT-ON-OPALSWIFT.md).
 * Creates or refreshes a row in `leads` via the shared lead-ingest-core
 * (dedupe rules + studio notification live there); never touches
 * people/accounts.
 *
 * Spam: every enquiry goes through the shared spam check (lead-spam.ts)
 * first. Spam gets 200 { outcome: "spam" } and no row, so callers don't
 * retry; the contact form then skips its email too.
 *
 * Auth: `Authorization: Bearer <CRM_INGEST_SECRET>` — machine-to-machine,
 * same shape as the CRON_SECRET functions but FAIL-CLOSED: with no secret
 * configured the function refuses every request instead of allowing them
 * (this endpoint writes and is internet-reachable).
 */

Deno.serve(withMonitoring("crm-lead-ingest", async (req) => {
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

  let payload: IngestPayload;
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

    const { fields, opts } = leadFromPayload(payload, new Date().toISOString());
    // A lead email without a display name is named after its address
    // ("david1985"): that name says nothing about spam, so it isn't checked.
    const isEmail = !("contact" in payload);
    const spamCheck = assessLeadSpam({
      name: isEmail && !payload.message.fromName?.trim() ? null : fields.name,
      email: fields.email,
      message: fields.lastCommunicationNote,
      checkMessageShape: !isEmail,
    });
    if (spamCheck.spam) {
      console.warn(`crm-lead-ingest: refused as spam (${spamCheck.reasons.join(", ")})`);
      return json({ outcome: "spam" });
    }
    const result = await writeInboundLead(service, tenant as LeadTenant, fields, opts);

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
}));
