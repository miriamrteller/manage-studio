import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { pickActiveConsentTemplate, signatureMatchesActiveForm } from "./studio-legal.ts";

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

  const activeTemplate = await pickActiveConsentTemplate(service, tenantId, engagement.person_id as string);

  if (!activeTemplate) {
    return { satisfied: false, evidenceId: null };
  }

  // The signed version may be the same form in another language.
  let signed: { id: string; version: number; status: string; audience: string | null } | null = null;
  if (evidence.consent_template_id === activeTemplate.id) {
    signed = { id: activeTemplate.id, version: activeTemplate.version, status: "active", audience: activeTemplate.audience };
  } else if (evidence.consent_template_id) {
    const { data } = await service
      .from("consent_templates")
      .select("id, version, status, audience")
      .eq("id", evidence.consent_template_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    signed = (data as typeof signed) ?? null;
  }
  const templateMatches = signatureMatchesActiveForm(activeTemplate, signed, evidence.consent_version as number);

  return {
    satisfied: templateMatches,
    evidenceId: templateMatches ? (evidence.id as string) : null,
  };
}

