export interface WaiverTemplateRow {
  id: string;
  version: number;
  name: string;
  content: string;
}

export interface EnrolmentWaiverGateInput {
  offeringWaiverRequired: boolean;
  personName: string | null;
  personDateOfBirth: string | null;
  engagementEvidenceId: string | null;
  evidenceValidForEnrolment: boolean;
  recentSignedEvidenceId: string | null;
  template: WaiverTemplateRow | null;
}

export interface EnrolmentWaiverGateResult {
  required: boolean;
  alreadySigned: boolean;
  evidenceId: string | null;
  template: WaiverTemplateRow | null;
  isMinorStudent: boolean;
  studentName: string | null;
}

const MINOR_AGE_MS = 18 * 365.25 * 24 * 60 * 60 * 1000;

function isMinorDateOfBirth(dateOfBirth: string | null | undefined): boolean {
  if (!dateOfBirth) return false;
  return new Date(dateOfBirth) > new Date(Date.now() - MINOR_AGE_MS);
}

/** Pure waiver gate — mirrors apps/web/src/features/enrolment/lib/checkEngagementWaiver.ts */
export function resolveEnrolmentWaiverGateFromRows(
  input: EnrolmentWaiverGateInput,
): EnrolmentWaiverGateResult {
  const isMinorStudent = isMinorDateOfBirth(input.personDateOfBirth);
  const studentName = input.personName;

  if (!input.offeringWaiverRequired) {
    return {
      required: false,
      alreadySigned: false,
      evidenceId: null,
      template: null,
      isMinorStudent,
      studentName,
    };
  }

  if (!input.template) {
    return {
      required: false,
      alreadySigned: false,
      evidenceId: null,
      template: null,
      isMinorStudent,
      studentName,
    };
  }

  if (input.engagementEvidenceId && input.evidenceValidForEnrolment) {
    return {
      required: true,
      alreadySigned: true,
      evidenceId: input.engagementEvidenceId,
      template: input.template,
      isMinorStudent,
      studentName,
    };
  }

  if (input.recentSignedEvidenceId) {
    return {
      required: true,
      alreadySigned: true,
      evidenceId: input.recentSignedEvidenceId,
      template: input.template,
      isMinorStudent,
      studentName,
    };
  }

  return {
    required: true,
    alreadySigned: false,
    evidenceId: null,
    template: input.template,
    isMinorStudent,
    studentName,
  };
}
