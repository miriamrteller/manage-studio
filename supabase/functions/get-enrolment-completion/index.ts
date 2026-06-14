import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { extractWaiverToken, verifyWaiverToken } from "../_shared/waiver-token.ts";
import { resolveOfferingPrice } from "../_shared/email-dist/pricing.js";
import { engagementHasSignedWaiver } from "../_shared/engagement-waiver.ts";
import { resolveAllowedTokenRecipientEmails } from "../_shared/token-recipient.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const rawToken = extractWaiverToken(req.headers.get("authorization"));
    if (!rawToken) return jsonResponse({ error: "Missing or invalid WaiverToken" }, 401);

    const payload = await verifyWaiverToken(rawToken);
    if (!payload) return jsonResponse({ error: "WaiverToken invalid or expired" }, 401);

    const service = createServiceClient();

    const { data: engagement } = await service
      .from("engagements")
      .select("id, tenant_id, person_id, offering_id, status, waiver_evidence_id")
      .eq("id", payload.eid)
      .eq("tenant_id", payload.tid)
      .single();
    if (!engagement) return jsonResponse({ error: "Engagement not found" }, 404);
    if (!["pending_payment", "active"].includes(engagement.status as string)) {
      return jsonResponse({ error: "Engagement is not eligible for completion" }, 409);
    }

    const { data: student } = await service
      .from("people")
      .select("name, email, date_of_birth, account_id")
      .eq("id", engagement.person_id)
      .eq("tenant_id", payload.tid)
      .single();
    if (!student) return jsonResponse({ error: "Student not found" }, 404);

    const tokenEmail = payload.em.trim().toLowerCase();
    const allowedEmails = await resolveAllowedTokenRecipientEmails(service, {
      tenantId: payload.tid,
      engagementId: engagement.id as string,
      personId: engagement.person_id as string,
    });
    if (!tokenEmail || !allowedEmails.has(tokenEmail)) {
      return jsonResponse({ error: "Token email mismatch" }, 401);
    }

    const { data: offering } = await service
      .from("offerings")
      .select("id, name, currency, price_minor, waiver_required")
      .eq("id", engagement.offering_id)
      .eq("tenant_id", payload.tid)
      .single();
    if (!offering) return jsonResponse({ error: "Offering not found" }, 404);

    const { data: tenant } = await service
      .from("tenants")
      .select("id, vat_rate, prices_include_vat, currency")
      .eq("id", payload.tid)
      .single();
    if (!tenant) return jsonResponse({ error: "Tenant not found" }, 404);

    const pricing = resolveOfferingPrice(
      { price_minor: offering.price_minor as number },
      {
        vat_rate: Number(tenant.vat_rate ?? 0.17),
        prices_include_vat: tenant.prices_include_vat !== false,
      },
    );

    let template: Record<string, unknown> | null = null;
    if (offering.waiver_required) {
      const { data: activeTemplate } = await service
        .from("consent_templates")
        .select("id, version, name, content")
        .eq("tenant_id", payload.tid)
        .eq("status", "active")
        .maybeSingle();
      if (activeTemplate) {
        template = {
          id: activeTemplate.id,
          version: activeTemplate.version,
          name: activeTemplate.name,
          content: activeTemplate.content,
        };
      }
    }

    const waiverState = await engagementHasSignedWaiver(service, payload.eid, payload.tid, {
      requireActiveTemplateMatch: false,
    });

    return jsonResponse({
      engagementId: engagement.id,
      personId: engagement.person_id,
      offeringId: engagement.offering_id,
      tenantId: payload.tid,
      status: engagement.status,
      alreadyComplete: engagement.status === "active",
      studentName: student.name,
      className: offering.name,
      waiverRequired: Boolean(offering.waiver_required),
      waiverAlreadySigned: waiverState.satisfied,
      waiverEvidenceId: waiverState.evidenceId,
      template,
      isMinorStudent: student.date_of_birth
        ? new Date(student.date_of_birth as string) >
          new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000)
        : false,
      amountMinor: pricing.totalMinor,
      currency: (offering.currency ?? tenant.currency ?? "ILS").toUpperCase(),
    });
  } catch (err) {
    console.error("[get-enrolment-completion]", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});

