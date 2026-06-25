import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  evaluateAgeEnrolment,
  shouldBlockAgeEnrolment,
  type AgeEnrolmentActor,
} from './ageEnrolmentPolicy';
import { enrolmentAgeMismatchMessage } from '@/lib/personAge';
import type { EnrolmentConstraints } from '../hooks/useEnrolmentContext';

export type { AgeEnrolmentActor };

export interface SelectedClassAgeValidation {
  /** True when DOB fails the selected class age band at season start. */
  blocked: boolean;
  studentAge: number | null;
  classAges: string | null;
}

export function useSelectedClassAgeValidation(
  constraints: EnrolmentConstraints,
  dateOfBirth: string,
  options?: {
    actor?: AgeEnrolmentActor;
    ageOverrideConfirmed?: boolean;
  },
): SelectedClassAgeValidation {
  const actor = options?.actor ?? 'parent';
  const ageOverrideConfirmed = options?.ageOverrideConfirmed;

  return useMemo(() => {
    const decision = evaluateAgeEnrolment({
      dateOfBirth,
      ageBand: constraints.ageBand,
      seasonStartDate: constraints.seasonStartDate,
      actor,
      ageOverrideConfirmed,
    });

    return {
      blocked: shouldBlockAgeEnrolment(decision, actor, ageOverrideConfirmed),
      studentAge: decision.studentAge,
      classAges: decision.classAges,
    };
  }, [constraints, dateOfBirth, actor, ageOverrideConfirmed]);
}

export function SelectedClassAgeAlert({
  constraints,
  dateOfBirth,
  actor,
  ageOverrideConfirmed,
}: {
  constraints: EnrolmentConstraints;
  dateOfBirth: string;
  actor?: AgeEnrolmentActor;
  ageOverrideConfirmed?: boolean;
}) {
  const { t } = useTranslation();
  const { blocked, studentAge, classAges } = useSelectedClassAgeValidation(
    constraints,
    dateOfBirth,
    { actor, ageOverrideConfirmed },
  );

  if (!blocked || studentAge == null || !classAges) {
    return null;
  }

  return (
    <div
      className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-1"
      role="alert"
    >
      <p>{enrolmentAgeMismatchMessage(studentAge, classAges, t)}</p>
      <p className="text-xs">{t('pages.enrolment.selected_class_age_ineligible_hint')}</p>
    </div>
  );
}

export function getSelectedClassAgeError(
  constraints: EnrolmentConstraints,
  dateOfBirth: string | null | undefined,
  t: TFunction,
  options?: {
    actor?: AgeEnrolmentActor;
    ageOverrideConfirmed?: boolean;
  },
): string | null {
  if (!dateOfBirth) return null;

  const actor = options?.actor ?? 'parent';
  const decision = evaluateAgeEnrolment({
    dateOfBirth,
    ageBand: constraints.ageBand,
    seasonStartDate: constraints.seasonStartDate,
    actor,
    ageOverrideConfirmed: options?.ageOverrideConfirmed,
  });

  if (!shouldBlockAgeEnrolment(decision, actor, options?.ageOverrideConfirmed)) {
    return null;
  }

  const { studentAge, classAges } = decision;

  if (studentAge == null || !classAges) {
    return t('pages.enrolment.ineligible_age');
  }

  return enrolmentAgeMismatchMessage(studentAge, classAges, t);
}
