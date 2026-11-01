import { z } from "npm:zod@3.22.4";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { checkAndIncrementAttempt, normaliseContactPoint } from "../_shared/rate-limit.ts";
import { isAllowedCrmOrigin } from "../_shared/crm-contract/allowed-origin.ts";
import {
  channelFromSrc,
  LEAD_TENANT_COLUMNS,
  type LeadTenant,
  notifyTenantOfLead,
  writeInboundLead,
} from "../_shared/crm-contract/lead-ingest-core.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

/**
 * crm-lead-capture — PUBLIC inquiry-form endpoint (step 2 of
 * docs/plans/crm-lead-capture-channels.md).
 *
 * One endpoint serves every tenant and every "social" channel: the tenant
 * site's /inquire form POSTs here, and the studio's capture links tag the
 * source (?src=instagram|linkedin|whatsapp) so the lead lands with its real
 * acquisition channel. Unknown/missing src is honestly `website`.
 *
 * Abuse posture (no auth by design — it's an inquiry form):
 *   - CORS allowlist: tenant portals under APP_ROOT_DOMAIN + localhost dev.
 *   - Honeypot field `website`: bots that fill it get a 200 and no row.
 *   - Rate limit: the shared fail-closed limiter (5/hour) keyed on the
 *     submitter's email, falling back to the caller IP.
 *   - Writes go only to `leads`, via the shared lead-ingest-core.
 */

const payloadSchema = z.object({
  tenantSubdomain: z.string().min(1).max(63),
  name: z.string().min(1).max(200),
  email: z.string().email().max(320).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  message: z.string().max(5000).nullable().optional(),
  interest: z.string().max(200).nullable().optional(),
  src: z.string().max(40).nullable().optional(),
  /** Honeypot — humans never see it, bots fill it. */
  website: z.string().max(200).nullable().optional(),
  /**
   * Marketing opt-in per channel, with the exact wording shown next to each
   * box (Communications Law §30A proof of consent). Absent = no opt-in.
   */
  marketingConsent: z
    .object({
      version: z.string().max(64),
      items: z
        .array(
          z.object({
            kind: z.enum(["marketing_email", "marketing_sms", "marketing_whatsapp"]),
            wording: z.string().min(1).max(2000),
          }),
        )
        .max(3),
    })
    .nullable()
    .optional(),
});

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowed = isAllowedCrmOrigin(origin, {
    rootDomain: Deno.env.get("APP_ROOT_DOMAIN")?.trim() || null,
    configuredOrigin: Deno.env.get("CRM_CONTACTS_ALLOWED_ORIGIN")?.trim() || null,
  });
  if (!origin || !allowed) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Record opt-ins as consent_records and set the lead's quick flag. Never fails the inquiry. */
async function recordLeadMarketingConsent(
  service: ReturnType<typeof createServiceClient>,
  input: {
    tenantId: string;
    leadId: string;
    version: string;
    items: Array<{ kind: string; wording: string }>;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<void> {
  try {
    const rows = input.items.map((item) => ({
      tenant_id: input.tenantId,
      lead_id: input.leadId,
      kind: item.kind,
      granted: true,
      wording: item.wording,
      wording_version: input.version,
      source: "inquiry",
      ip_address: input.ip,
      user_agent: input.userAgent?.slice(0, 512) ?? null,
    }));
    const { error } = await service.from("consent_records").insert(rows);
    if (error) throw error;
    await service.from("leads").update({ marketing_consent: true }).eq("id", input.leadId);
  } catch (err) {
    console.error("crm-lead-capture: could not record marketing consent", err);
  }
}

Deno.serve(withMonitoring("crm-lead-capture", async (req) => {
  const cors = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(await req.json());
  } catch {
    return json({ error: "Invalid payload" }, 400);
  }

  // Honeypot: pretend success, write nothing.
  if (nonEmpty(payload.website)) {
    return json({ outcome: "created" });
  }

  try {
    const service = createServiceClient();

    const { data: tenant, error: tenantError } = await service
      .from("tenants")
      .select(LEAD_TENANT_COLUMNS)
      .eq("subdomain", payload.tenantSubdomain.toLowerCase())
      .single();
    if (tenantError || !tenant) {
      return json({ error: "Unknown tenant" }, 404);
    }
    const leadTenant = tenant as LeadTenant;

    const email = nonEmpty(payload.email)?.toLowerCase() ?? null;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const contactPoint = normaliseContactPoint(email ?? `ip:${ip}`);
    const limit = await checkAndIncrementAttempt(service, leadTenant.id, contactPoint, "email");
    if (!limit.allowed) {
      return json({ error: "Too many requests. Please try again later." }, 429);
    }

    const fields = {
      name: payload.name.trim(),
      email,
      phone: nonEmpty(payload.phone),
      interest: nonEmpty(payload.interest),
      lastCommunicationNote: nonEmpty(payload.message),
    };

    const result = await writeInboundLead(service, leadTenant, fields, {
      channel: channelFromSrc(payload.src),
      sourceRef: null,
      receivedAt: new Date().toISOString(),
    });

    const optIns = payload.marketingConsent?.items ?? [];
    if (optIns.length > 0 && result.leadId) {
      await recordLeadMarketingConsent(service, {
        tenantId: leadTenant.id,
        leadId: result.leadId,
        version: payload.marketingConsent!.version,
        items: optIns,
        ip: ip === "unknown" ? null : ip,
        userAgent: req.headers.get("user-agent"),
      });
    }

    if (result.outcome !== "duplicate") {
      await notifyTenantOfLead(service, leadTenant, fields, result.outcome);
    }

    return json({ outcome: result.outcome }, result.outcome === "created" ? 201 : 200);
  } catch (err) {
    console.error("crm-lead-capture: unhandled error", err);
    return json({ error: "Internal error" }, 500);
  }
}));
