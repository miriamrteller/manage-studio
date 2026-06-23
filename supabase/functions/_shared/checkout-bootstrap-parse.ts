import type {
  BootstrapBlockReason,
  PrepareEnrolmentCheckoutBody,
} from "./checkout-bootstrap-types.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePrepareEnrolmentCheckoutBody(
  raw: unknown,
):
  | { ok: true; body: PrepareEnrolmentCheckoutBody }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid request body" };
  }

  const body = raw as Record<string, unknown>;
  const phase = body.phase;
  const mode = body.mode;

  if (phase !== "load" && phase !== "pay") {
    return { ok: false, error: "phase must be load or pay" };
  }

  if (mode === "existing_engagement") {
    const engagementId = body.engagement_id;
    if (typeof engagementId !== "string" || !UUID_RE.test(engagementId)) {
      return { ok: false, error: "engagement_id is required" };
    }
    const offeringId = body.offering_id;
    if (phase === "pay") {
      if (typeof offeringId !== "string" || !UUID_RE.test(offeringId)) {
        return { ok: false, error: "offering_id is required for pay phase" };
      }
    } else if (offeringId != null && (typeof offeringId !== "string" || !UUID_RE.test(offeringId))) {
      return { ok: false, error: "offering_id must be a UUID when provided" };
    }

    return {
      ok: true,
      body: {
        phase,
        mode: "existing_engagement",
        engagement_id: engagementId,
        ...(typeof offeringId === "string" ? { offering_id: offeringId } : {}),
        ...(typeof body.enrolment_token === "string"
          ? { enrolment_token: body.enrolment_token }
          : {}),
      },
    };
  }

  if (mode === "create_engagement") {
    if (phase !== "pay") {
      return { ok: false, error: "create_engagement requires phase=pay" };
    }
    const personId = body.person_id;
    const offeringId = body.offering_id;
    const seasonId = body.season_id;
    if (
      typeof personId !== "string" ||
      !UUID_RE.test(personId) ||
      typeof offeringId !== "string" ||
      !UUID_RE.test(offeringId) ||
      typeof seasonId !== "string" ||
      !UUID_RE.test(seasonId)
    ) {
      return { ok: false, error: "person_id, offering_id, and season_id are required" };
    }

    return {
      ok: true,
      body: {
        phase: "pay",
        mode: "create_engagement",
        person_id: personId,
        offering_id: offeringId,
        season_id: seasonId,
        ...(typeof body.waiver_evidence_id === "string"
          ? { waiver_evidence_id: body.waiver_evidence_id }
          : {}),
        ...(body.age_override_confirmed === true
          ? { age_override_confirmed: true }
          : {}),
        ...(typeof body.age_override_reason === "string" ||
        body.age_override_reason === null
          ? { age_override_reason: body.age_override_reason as string | null }
          : {}),
      },
    };
  }

  return { ok: false, error: "mode must be existing_engagement or create_engagement" };
}

export function resolveBootstrapBlockReason(
  status: string,
  waiverBlocksPayment: boolean,
): BootstrapBlockReason | undefined {
  if (status === "active") return "already_complete";
  if (status === "pending_waiver") return "pending_waiver";
  if (status !== "pending_payment") return "not_payable";
  if (waiverBlocksPayment) return "waiver_required";
  return undefined;
}
