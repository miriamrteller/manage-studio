import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { resolveOfferingPrice } from "./email-dist/pricing.js";
import { resolveAllowedTokenRecipientEmails } from "./token-recipient.ts";
import type { EnrolmentCompletionContext } from "./checkout-bootstrap-types.ts";
import {
  resolveEnrolmentWaiverGateFromRows,
  type WaiverTemplateRow,
} from "./enrolment-waiver-gate.ts";

async function evidenceIsValidForEnrolment(
  service: SupabaseClient,
  tenantId: string,
  evidenceId: string,
  personId: string,
  offeringId: string,
): Promise<boolean> {
  const { data: evidence } = await service
    .from("waiver_evidence")
    .select("id, status, person_id, offering_id, tenant_id")
    .eq("id", evidenceId)
    .maybeSingle();

  return Boolean(
    evidence &&
      evidence.status === "signed" &&
      evidence.tenant_id === tenantId &&
      evidence.person_id === personId &&
      evidence.offering_id === offeringId,
  );
}

export async function loadEnrolmentCompletionContext(
  service: SupabaseClient,
  params: {
    engagementId: string;
    tenantId: string;
    tokenEmail?: string | null;
    useRecentEvidenceFallback: boolean;
  },
): Promise<
  | { ok: true; context: EnrolmentCompletionContext }
  | { ok: false; error: string; status: number }
> {
  const { engagementId, tenantId, tokenEmail, useRecentEvidenceFallback } = params;

  const { data: engagement, error: engagementError } = await service
    .from("engagements")
    .select("id, tenant_id, person_id, offering_id, status, waiver_evidence_id")
    .eq("id", engagementId)
    .eq("tenant_id", tenantId)
    .single();

  if (engagementError || !engagement) {
    return { ok: false, error: "Engagement not found", status: 404 };
  }

  if (!["pending_payment", "active", "pending_waiver"].includes(engagement.status as string)) {
    return { ok: false, error: "Engagement is not eligible for completion", status: 409 };
  }

  const { data: student } = await service
    .from("people")
    .select("name, email, date_of_birth, account_id")
    .eq("id", engagement.person_id)
    .eq("tenant_id", tenantId)
    .single();

  if (!student) {
    return { ok: false, error: "Student not found", status: 404 };
  }

  if (tokenEmail) {
    const allowedEmails = await resolveAllowedTokenRecipientEmails(service, {
      tenantId,
      engagementId,
      personId: engagement.person_id as string,
    });
    if (!allowedEmails.has(tokenEmail)) {
      return { ok: false, error: "Token email mismatch", status: 401 };
    }
  }

  const { data: offering } = await service
    .from("offerings")
    .select("id, name, currency, price_minor, waiver_required")
    .eq("id", engagement.offering_id)
    .eq("tenant_id", tenantId)
    .single();

  if (!offering) {
    return { ok: false, error: "Offering not found", status: 404 };
  }

  const { data: tenant } = await service
    .from("tenants")
    .select("id, vat_rate, prices_include_vat, currency")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    return { ok: false, error: "Tenant not found", status: 404 };
  }

  const pricing = resolveOfferingPrice(
    { price_minor: offering.price_minor as number },
    {
      vat_rate: Number(tenant.vat_rate ?? 0.17),
      prices_include_vat: tenant.prices_include_vat !== false,
    },
  );

  let template: WaiverTemplateRow | null = null;
  if (offering.waiver_required) {
    const { data: activeTemplate } = await service
      .from("consent_templates")
      .select("id, version, name, content")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .maybeSingle();
    if (activeTemplate) {
      template = {
        id: activeTemplate.id as string,
        version: activeTemplate.version as number,
        name: activeTemplate.name as string,
        content: activeTemplate.content as string,
      };
    }
  }

  const linkedEvidenceId = (engagement.waiver_evidence_id as string | null) ?? null;
  let evidenceValidForEnrolment = false;
  if (linkedEvidenceId) {
    evidenceValidForEnrolment = await evidenceIsValidForEnrolment(
      service,
      tenantId,
      linkedEvidenceId,
      engagement.person_id as string,
      engagement.offering_id as string,
    );
  }

  let recentSignedEvidenceId: string | null = null;
  if (offering.waiver_required && !evidenceValidForEnrolment) {
    const { data: recentEvidence } = await service
      .from("waiver_evidence")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("person_id", engagement.person_id)
      .eq("offering_id", engagement.offering_id)
      .eq("status", "signed")
      .order("signed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    recentSignedEvidenceId = (recentEvidence?.id as string | undefined) ?? null;
  }

  const gate = resolveEnrolmentWaiverGateFromRows({
    offeringWaiverRequired: Boolean(offering.waiver_required),
    personName: student.name as string,
    personDateOfBirth: (student.date_of_birth as string | null) ?? null,
    engagementEvidenceId: linkedEvidenceId,
    evidenceValidForEnrolment,
    recentSignedEvidenceId,
    template,
  });
  const waiverAlreadySigned = gate.alreadySigned;
  const waiverEvidenceId = gate.evidenceId;

  const isMinorStudent = student.date_of_birth
    ? new Date(student.date_of_birth as string) >
      new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000)
    : false;

  return {
    ok: true,
    context: {
      engagementId: engagement.id as string,
      personId: engagement.person_id as string,
      offeringId: engagement.offering_id as string,
      tenantId,
      status: engagement.status as string,
      alreadyComplete: engagement.status === "active",
      studentName: student.name as string,
      className: offering.name as string,
      waiverRequired: Boolean(offering.waiver_required && template),
      waiverAlreadySigned,
      waiverEvidenceId,
      template: template as Record<string, unknown> | null,
      isMinorStudent,
      amountMinor: pricing.totalMinor,
      currency: (offering.currency ?? tenant.currency ?? "ILS").toUpperCase(),
    },
  };
}

/** Flat response for get-enrolment-completion backward compat */
export function flattenCompletionContext(context: EnrolmentCompletionContext): Record<string, unknown> {
  return {
    engagementId: context.engagementId,
    personId: context.personId,
    offeringId: context.offeringId,
    tenantId: context.tenantId,
    status: context.status,
    alreadyComplete: context.alreadyComplete,
    studentName: context.studentName,
    className: context.className,
    waiverRequired: context.waiverRequired,
    waiverAlreadySigned: context.waiverAlreadySigned,
    waiverEvidenceId: context.waiverEvidenceId,
    template: context.template,
    isMinorStudent: context.isMinorStudent,
    amountMinor: context.amountMinor,
    currency: context.currency,
  };
}
