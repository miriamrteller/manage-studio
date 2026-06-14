import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

interface EngagementWaiverOptions {
  requireActiveTemplateMatch?: boolean;
}

export interface EngagementWaiverResult {
  satisfied: boolean;
  evidenceId: string | null;
}

/**
 * Source-of-truth waiver check for a specific engagement.
 * Never falls back to person-level evidence.
 */
export async function engagementHasSignedWaiver(
  service: SupabaseClient,
  engagementId: string,
  tenantId: string,
  options: EngagementWaiverOptions = {},
): Promise<EngagementWaiverResult> {
  const { requireActiveTemplateMatch = false } = options;

  const { data: engagement, error: engagementError } = await service
    .from("engagements")
    .select("id, tenant_id, person_id, offering_id, waiver_evidence_id")
    .eq("id", engagementId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (engagementError || !engagement?.waiver_evidence_id) {
    return { satisfied: false, evidenceId: null };
  }

  const { data: evidence, error: evidenceError } = await service
    .from("waiver_evidence")
    .select("id, tenant_id, person_id, offering_id, status, consent_template_id, consent_version")
    .eq("id", engagement.waiver_evidence_id)
    .maybeSingle();

  if (
    evidenceError ||
    !evidence ||
    evidence.status !== "signed" ||
    evidence.tenant_id !== engagement.tenant_id ||
    evidence.person_id !== engagement.person_id ||
    evidence.offering_id !== engagement.offering_id
  ) {
    return { satisfied: false, evidenceId: null };
  }

  if (!requireActiveTemplateMatch) {
    return { satisfied: true, evidenceId: evidence.id as string };
  }

  const { data: activeTemplate } = await service
    .from("consent_templates")
    .select("id, version")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();

  if (!activeTemplate) {
    return { satisfied: false, evidenceId: null };
  }

  const templateMatches =
    activeTemplate.id === evidence.consent_template_id &&
    activeTemplate.version === evidence.consent_version;

  return {
    satisfied: templateMatches,
    evidenceId: templateMatches ? (evidence.id as string) : null,
  };
}

