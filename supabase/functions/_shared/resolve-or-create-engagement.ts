import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { ensureBillingAccountForStudent } from "./ensure-billing-account.ts";
import { isAgeEligible } from "./age-eligibility.ts";
import { ENROLMENT_BLOCKING_DUPLICATE_STATUSES } from "./enrolment-statuses.ts";
import { assertAdminAgeOverride, assertCanCreateEngagement } from "./authorize-engagement-create.ts";

export interface ResolveOrCreateEngagementInput {
  service: SupabaseClient;
  tenantId: string;
  authUserId: string;
  personId: string;
  offeringId: string;
  seasonId: string;
  waiverEvidenceId?: string | null;
  ageOverrideConfirmed?: boolean;
  ageOverrideReason?: string | null;
}

export type ResolveOrCreateEngagementResult =
  | { ok: true; engagementId: string; offeringId: string }
  | { ok: false; error: string; status: number };

export async function resolveOrCreateEngagement(
  input: ResolveOrCreateEngagementInput,
): Promise<ResolveOrCreateEngagementResult> {
  const {
    service,
    tenantId,
    authUserId,
    personId,
    offeringId,
    seasonId,
    waiverEvidenceId,
    ageOverrideConfirmed = false,
    ageOverrideReason = null,
  } = input;

  const auth = await assertCanCreateEngagement(service, { authUserId, tenantId, personId });
  if (!auth.ok) return auth;

  const { data: existingPending } = await service
    .from("engagements")
    .select("id, billing_account_id")
    .eq("tenant_id", tenantId)
    .eq("person_id", personId)
    .eq("offering_id", offeringId)
    .eq("season_id", seasonId)
    .eq("status", "pending_payment")
    .maybeSingle();

  if (existingPending?.id) {
    let billingAccountId = existingPending.billing_account_id as string | null;
    if (!billingAccountId) {
      billingAccountId = await ensureBillingAccountForStudent(service, tenantId, personId);
      const { error: linkError } = await service
        .from("engagements")
        .update({ billing_account_id: billingAccountId })
        .eq("id", existingPending.id);
      if (linkError) {
        return { ok: false, error: "Failed to link billing account", status: 500 };
      }
    }
    return {
      ok: true,
      engagementId: existingPending.id as string,
      offeringId,
    };
  }

  const { data: duplicate } = await service
    .from("engagements")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("person_id", personId)
    .eq("offering_id", offeringId)
    .eq("season_id", seasonId)
    .in("status", [...ENROLMENT_BLOCKING_DUPLICATE_STATUSES])
    .maybeSingle();

  if (duplicate) {
    return { ok: false, error: "Person already enrolled in this class for this term", status: 409 };
  }

  const [{ data: person }, { data: offering }] = await Promise.all([
    service
      .from("people")
      .select("date_of_birth")
      .eq("id", personId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    service
      .from("offerings")
      .select("min_age, max_age, season_id")
      .eq("id", offeringId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  if (!offering) {
    return { ok: false, error: "Offering not found", status: 404 };
  }

  let seasonStartDate: string | null = null;
  if (offering.season_id) {
    const { data: season } = await service
      .from("seasons")
      .select("start_date")
      .eq("id", offering.season_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    seasonStartDate = (season?.start_date as string | null) ?? null;
  }

  const ageEligible = isAgeEligible(
    {
      min_age: offering.min_age as number | null,
      max_age: offering.max_age as number | null,
      season_start_date: seasonStartDate,
    },
    { date_of_birth: (person?.date_of_birth as string | null) ?? null },
  );

  const insertPayload: Record<string, unknown> = {
    tenant_id: tenantId,
    person_id: personId,
    offering_id: offeringId,
    season_id: seasonId,
    status: "pending_payment",
  };

  if (waiverEvidenceId) {
    insertPayload.waiver_evidence_id = waiverEvidenceId;
  }

  if (ageEligible === false) {
    if (!ageOverrideConfirmed) {
      return { ok: false, error: "Student is not eligible for this class age range", status: 403 };
    }
    const adminCheck = await assertAdminAgeOverride(service, { authUserId, tenantId });
    if (!adminCheck.ok) return adminCheck;

    insertPayload.age_override_at = new Date().toISOString();
    insertPayload.age_override_by = authUserId;
    insertPayload.age_override_reason = ageOverrideReason?.trim() || null;
  }

  insertPayload.billing_account_id = await ensureBillingAccountForStudent(
    service,
    tenantId,
    personId,
  );

  const { data: created, error: createError } = await service
    .from("engagements")
    .insert(insertPayload)
    .select("id")
    .single();

  if (createError || !created?.id) {
    return { ok: false, error: createError?.message ?? "Failed to create engagement", status: 500 };
  }

  return { ok: true, engagementId: created.id as string, offeringId };
}
