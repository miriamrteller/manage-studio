import {
  classAgeBandConfigured,
  formatAgeRange,
  isPersonEligibleForSelectedClass,
  personAgeAtSeasonStart,
  type ClassAgeContext,
} from './check-requirements';

export type AgeEnrolmentActor = 'guest' | 'parent' | 'admin';

export interface AgeEnrolmentDecision {
  /** False when student is out of the class age band. */
  eligible: boolean;
  /** False when DOB, age band, or season start is missing. */
  canValidate: boolean;
  studentAge: number | null;
  /** Formatted age range for UI. */
  classAges: string | null;
}

export function evaluateAgeEnrolment(input: {
  dateOfBirth?: string | null;
  ageBand?: ClassAgeContext | null;
  seasonStartDate?: string | null;
  actor: AgeEnrolmentActor;
  ageOverrideConfirmed?: boolean;
}): AgeEnrolmentDecision {
  const { dateOfBirth, ageBand, seasonStartDate } = input;

  const classAges = ageBand
    ? formatAgeRange(ageBand.min_age, ageBand.max_age)
    : null;

  if (!dateOfBirth || !classAgeBandConfigured(ageBand) || !seasonStartDate) {
    return { eligible: true, canValidate: false, studentAge: null, classAges };
  }

  const eligibleResult = isPersonEligibleForSelectedClass(
    dateOfBirth,
    ageBand,
    seasonStartDate,
  );

  if (eligibleResult === null) {
    return { eligible: true, canValidate: false, studentAge: null, classAges };
  }

  const studentAge = personAgeAtSeasonStart(dateOfBirth, seasonStartDate);

  return {
    eligible: eligibleResult,
    canValidate: true,
    studentAge,
    classAges,
  };
}

export function shouldBlockAgeEnrolment(
  decision: AgeEnrolmentDecision,
  actor: AgeEnrolmentActor,
  ageOverrideConfirmed?: boolean,
): boolean {
  if (!decision.canValidate || decision.eligible) return false;
  if (actor === 'admin' && ageOverrideConfirmed) return false;
  return true;
}
