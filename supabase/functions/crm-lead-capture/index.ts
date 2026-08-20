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

Deno.serve(async (req) => {
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

    if (result.outcome !== "duplicate") {
      await notifyTenantOfLead(service, leadTenant, fields, result.outcome);
    }

    return json({ outcome: result.outcome }, result.outcome === "created" ? 201 : 200);
  } catch (err) {
    console.error("crm-lead-capture: unhandled error", err);
    return json({ error: "Internal error" }, 500);
  }
});
