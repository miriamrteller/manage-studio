import { ConsentTemplateSchema, type ConsentTemplate, type Tenant } from '@shared/schemas';
import { TenantDB } from '@/lib/db';

const MINOR_AGE_MS = 18 * 365.25 * 24 * 60 * 60 * 1000;

function isMinorDateOfBirth(dateOfBirth: string | null | undefined): boolean {
  if (!dateOfBirth) return false;
  return new Date(dateOfBirth) > new Date(Date.now() - MINOR_AGE_MS);
}

async function evidenceIsValidForEnrolment(
  tenant: Tenant,
  evidenceId: string,
  personId: string,
  offeringId: string,
): Promise<boolean> {
  const { data: evidence } = await TenantDB.selectFor('waiver_evidence', tenant)
    .select('id, status, person_id, offering_id')
    .eq('id', evidenceId)
    .maybeSingle();

  return Boolean(
    evidence &&
      evidence.status === 'signed' &&
      evidence.person_id === personId &&
      evidence.offering_id === offeringId,
  );
}

export interface EnrolmentWaiverGateResult {
  required: boolean;
  alreadySigned: boolean;
  evidenceId: string | null;
  template: ConsentTemplate | null;
  isMinorStudent: boolean;
  studentName: string | null;
}

/** Decide whether checkout must show waiver signing (authenticated / parent completion). */
export async function resolveEnrolmentWaiverGate(
  tenant: Tenant,
  input: { engagementId: string; personId: string; offeringId: string },
): Promise<EnrolmentWaiverGateResult> {
  const empty: EnrolmentWaiverGateResult = {
    required: false,
    alreadySigned: false,
    evidenceId: null,
    template: null,
    isMinorStudent: false,
    studentName: null,
  };

  const [{ data: offering }, { data: person }, { data: engagement }] = await Promise.all([
    TenantDB.selectFor('offerings', tenant)
      .select('waiver_required')
      .eq('id', input.offeringId)
      .maybeSingle(),
    TenantDB.selectFor('people', tenant)
      .select('name, date_of_birth')
      .eq('id', input.personId)
      .maybeSingle(),
    TenantDB.selectFor('engagements', tenant)
      .select('waiver_evidence_id')
      .eq('id', input.engagementId)
      .maybeSingle(),
  ]);

  const isMinorStudent = isMinorDateOfBirth(person?.date_of_birth as string | null | undefined);
  const studentName = (person?.name as string | null) ?? null;

  if (!offering?.waiver_required) {
    return { ...empty, isMinorStudent, studentName };
  }

  const { data: templateRow } = await TenantDB.selectFor('consent_templates', tenant)
    .eq('status', 'active')
    .maybeSingle();

  if (!templateRow) {
    return { ...empty, isMinorStudent, studentName };
  }

  const template = ConsentTemplateSchema.parse(templateRow);

  const linkedEvidenceId = (engagement?.waiver_evidence_id as string | null) ?? null;
  if (
    linkedEvidenceId &&
    (await evidenceIsValidForEnrolment(
      tenant,
      linkedEvidenceId,
      input.personId,
      input.offeringId,
    ))
  ) {
    return {
      required: true,
      alreadySigned: true,
      evidenceId: linkedEvidenceId,
      template,
      isMinorStudent,
      studentName,
    };
  }

  const { data: recentEvidence } = await TenantDB.selectFor('waiver_evidence', tenant)
    .select('id')
    .eq('person_id', input.personId)
    .eq('offering_id', input.offeringId)
    .eq('status', 'signed')
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingEvidenceId = (recentEvidence?.id as string | undefined) ?? null;
  if (existingEvidenceId) {
    return {
      required: true,
      alreadySigned: true,
      evidenceId: existingEvidenceId,
      template,
      isMinorStudent,
      studentName,
    };
  }

  return {
    required: true,
    alreadySigned: false,
    evidenceId: null,
    template,
    isMinorStudent,
    studentName,
  };
}
