import { createServiceClient, requireAuthUser } from "./supabase.ts";
import { extractWaiverToken, verifyWaiverToken } from "./waiver-token.ts";
import { loadEnrolmentCompletionContext } from "./enrolment-completion-context.ts";
import { createCheckoutCharge } from "./create-checkout-charge.ts";
import { resolveOrCreateEngagement } from "./resolve-or-create-engagement.ts";
import {
  parsePrepareEnrolmentCheckoutBody,
  resolveBootstrapBlockReason,
} from "./checkout-bootstrap-parse.ts";
import type {
  PrepareEnrolmentCheckoutBody,
  PrepareEnrolmentCheckoutResponse,
} from "./checkout-bootstrap-types.ts";

export { parsePrepareEnrolmentCheckoutBody, resolveBootstrapBlockReason } from "./checkout-bootstrap-parse.ts";

async function resolveAuth(
  req: Request,
  body: PrepareEnrolmentCheckoutBody,
): Promise<
  | {
      ok: true;
      service: ReturnType<typeof createServiceClient>;
      tenantId: string;
      authUserId: string | null;
      tokenEmail: string | null;
      useRecentEvidenceFallback: boolean;
    }
  | { ok: false; error: string; status: number }
> {
  const service = createServiceClient();
  const authHeader = req.headers.get("Authorization") ?? "";
  let tenantId: string | null = null;
  let authUserId: string | null = null;
  let tokenEmail: string | null = null;

  const bodyToken =
    body.mode === "existing_engagement" && typeof body.enrolment_token === "string"
      ? body.enrolment_token
      : null;
  const headerToken = extractWaiverToken(authHeader);
  const rawWaiverToken = headerToken ?? bodyToken;
  const verifiedToken = rawWaiverToken ? await verifyWaiverToken(rawWaiverToken) : null;

  if (authHeader.startsWith("Bearer ")) {
    const auth = await requireAuthUser(req);
    if (!("error" in auth)) {
      const { data: profile } = await service
        .from("user_profiles")
        .select("id, tenant_id")
        .eq("id", auth.user.id)
        .single();
      if (profile?.tenant_id) {
        tenantId = profile.tenant_id as string;
        authUserId = profile.id as string;
      }
    }
  }

  if (body.mode === "create_engagement") {
    if (!authUserId || !tenantId) {
      return { ok: false, error: "Bearer auth required for create_engagement", status: 401 };
    }
    return {
      ok: true,
      service,
      tenantId,
      authUserId,
      tokenEmail: null,
      useRecentEvidenceFallback: true,
    };
  }

  if (verifiedToken) {
    tenantId = verifiedToken.tid;
    tokenEmail = verifiedToken.em.toLowerCase();
    if (verifiedToken.eid !== body.engagement_id) {
      return { ok: false, error: "Token does not match engagement", status: 403 };
    }
  }

  if (!tenantId && !verifiedToken) {
    return { ok: false, error: "Valid enrolment token is required", status: 401 };
  }

  if (!tenantId) {
    const { data: engagementForTenant } = await service
      .from("engagements")
      .select("tenant_id")
      .eq("id", body.engagement_id)
      .single();
    if (!engagementForTenant?.tenant_id) {
      return { ok: false, error: "Engagement not found", status: 404 };
    }
    tenantId = engagementForTenant.tenant_id as string;
  }

  return {
    ok: true,
    service,
    tenantId,
    authUserId,
    tokenEmail,
    useRecentEvidenceFallback: !tokenEmail,
  };
}

export async function prepareEnrolmentCheckout(
  req: Request,
  body: PrepareEnrolmentCheckoutBody,
): Promise<
  | { ok: true; response: PrepareEnrolmentCheckoutResponse }
  | { ok: false; error: string; status: number }
> {
  const auth = await resolveAuth(req, body);
  if (!auth.ok) return auth;

  const { service, tenantId, authUserId, tokenEmail, useRecentEvidenceFallback } = auth;

  let engagementId: string;
  let offeringId: string;

  if (body.mode === "create_engagement") {
    const created = await resolveOrCreateEngagement({
      service,
      tenantId,
      authUserId: authUserId!,
      personId: body.person_id,
      offeringId: body.offering_id,
      seasonId: body.season_id,
      waiverEvidenceId: body.waiver_evidence_id ?? null,
      ageOverrideConfirmed: body.age_override_confirmed,
      ageOverrideReason: body.age_override_reason ?? null,
    });
    if (!created.ok) return created;
    engagementId = created.engagementId;
    offeringId = created.offeringId;
  } else {
    engagementId = body.engagement_id;
    if (body.offering_id) {
      offeringId = body.offering_id;
    } else {
      const { data: engagementRow } = await service
        .from("engagements")
        .select("offering_id")
        .eq("id", engagementId)
        .eq("tenant_id", tenantId)
        .single();
      if (!engagementRow?.offering_id) {
        return { ok: false, error: "Engagement not found", status: 404 };
      }
      offeringId = engagementRow.offering_id as string;
    }
  }

  const contextResult = await loadEnrolmentCompletionContext(service, {
    engagementId,
    tenantId,
    tokenEmail,
    useRecentEvidenceFallback,
  });
  if (!contextResult.ok) return contextResult;

  const context = contextResult.context;
  const waiverBlocksPayment =
    context.waiverRequired && !context.waiverAlreadySigned;
  const blockReason = resolveBootstrapBlockReason(context.status, waiverBlocksPayment);

  if (body.phase === "load" || blockReason) {
    return {
      ok: true,
      response: {
        context,
        charge: null,
        ...(blockReason ? { blockReason } : {}),
      },
    };
  }

  const chargeResult = await createCheckoutCharge(req, {
    offering_id: offeringId,
    engagement_id: engagementId,
    ...(body.mode === "existing_engagement" && body.enrolment_token
      ? { enrolment_token: body.enrolment_token }
      : {}),
  });

  if (!chargeResult.ok) {
    return { ok: false, error: chargeResult.error, status: chargeResult.status };
  }

  return {
    ok: true,
    response: {
      context,
      charge: chargeResult.charge,
    },
  };
}
