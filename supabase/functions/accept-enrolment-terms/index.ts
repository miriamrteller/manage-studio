/**
 * accept-enrolment-terms
 *
 * Stores that the enrolment terms + privacy notice checkbox was ticked for an engagement
 * (docs/legal/09 §1): version, time and who, on the engagement row, plus an audit entry.
 * Required before payment when the studio has published a terms URL.
 *
 * Auth: same as create-checkout — a signed-in parent (Bearer), a tenant admin attesting
 * on the parent's behalf (Bearer, tenant_admin), or a guest holding the enrolment token
 * (WaiverToken header / enrolment_token). verify_jwt = false in config.toml.
 * Idempotent: an engagement that already has terms_accepted_at is left unchanged.
 */
import { z } from "npm:zod@3.22.4";
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { extractWaiverToken, verifyWaiverToken } from "../_shared/waiver-token.ts";
import { resolveAllowedTokenRecipientEmails } from "../_shared/token-recipient.ts";
import {
  buildTermsAcceptancePatch,
  ENGAGEMENT_TERMS_ACCEPTED,
  resolveTermsAcceptedVia,
} from "../_shared/enrolment-terms.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

const BodySchema = z.object({
  engagement_id: z.string().uuid(),
  enrolment_token: z.string().optional(),
});

Deno.serve(withMonitoring("accept-enrolment-terms", async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const service = createServiceClient();
  const authHeader = req.headers.get("Authorization") ?? "";

  const { data: engagement } = await service
    .from("engagements")
    .select("id, tenant_id, person_id, status, terms_accepted_at, terms_version, booked_starts_at")
    .eq("id", body.engagement_id)
    .maybeSingle();

  if (!engagement) {
    return jsonResponse({ error: "Engagement not found" }, 404);
  }
  const tenantId = engagement.tenant_id as string;

  // Who is asking: signed-in user of this tenant, or a verified enrolment token.
  let authUserId: string | null = null;
  let isTenantAdmin = false;
  let tokenEmail: string | null = null;

  if (authHeader.startsWith("Bearer ")) {
    const auth = await requireAuthUser(req);
    if (!("error" in auth)) {
      const { data: profile } = await service
        .from("user_profiles")
        .select("id, tenant_id, role")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (profile?.tenant_id === tenantId) {
        authUserId = profile.id as string;
        isTenantAdmin = Array.isArray(profile.role) && profile.role.includes("tenant_admin");
      }
    }
  }

  if (!authUserId) {
    const rawToken = extractWaiverToken(authHeader) ?? body.enrolment_token ?? null;
    const verified = rawToken ? await verifyWaiverToken(service, rawToken) : null;
    if (!verified || verified.eid !== engagement.id || verified.tid !== tenantId) {
      return jsonResponse({ error: "Valid enrolment token is required" }, 401);
    }
    const allowed = await resolveAllowedTokenRecipientEmails(service, {
      tenantId,
      engagementId: engagement.id as string,
      personId: engagement.person_id as string,
    });
    tokenEmail = verified.em.toLowerCase();
    if (!allowed.has(tokenEmail)) {
      return jsonResponse({ error: "Token email mismatch" }, 403);
    }
  }

  if (!authUserId && !tokenEmail) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (engagement.terms_accepted_at) {
    return jsonResponse({
      ok: true,
      alreadyAccepted: true,
      acceptedAt: engagement.terms_accepted_at,
      version: engagement.terms_version,
    });
  }

  if (!["pending_payment", "pending_waiver"].includes(engagement.status as string)) {
    return jsonResponse({ error: "Engagement is not open for acceptance" }, 409);
  }

  const { data: tenant } = await service
    .from("tenants")
    .select("terms_url, enrolment_terms_version")
    .eq("id", tenantId)
    .single();

  if (!tenant?.terms_url) {
    return jsonResponse({ error: "This studio has not published enrolment terms" }, 409);
  }

  const via = resolveTermsAcceptedVia({ authUserId, isTenantAdmin, tokenEmail });
  const acceptedAt = new Date().toISOString();
  const version = (tenant.enrolment_terms_version as string | null) ?? "1";
  const patch = buildTermsAcceptancePatch({ via, version, authUserId, tokenEmail, acceptedAt });

  const { data: updated, error } = await service
    .from("engagements")
    .update(patch)
    .eq("id", engagement.id)
    .is("terms_accepted_at", null)
    .select("id, terms_accepted_at, terms_version")
    .maybeSingle();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }
  if (!updated) {
    // Raced with another acceptance of the same engagement: that one stands.
    return jsonResponse({ ok: true, alreadyAccepted: true });
  }

  await service.from("audit_log").insert({
    tenant_id: tenantId,
    action: ENGAGEMENT_TERMS_ACCEPTED,
    entity_type: "engagement",
    entity_id: engagement.id,
    actor_id: authUserId,
    after_state: {
      terms_version: version,
      terms_url: tenant.terms_url,
      accepted_via: via,
      accepted_by_email: tokenEmail,
      accepted_at: acceptedAt,
    },
  });

  return jsonResponse({
    ok: true,
    alreadyAccepted: false,
    acceptedAt,
    version,
    via,
  });
}));
