import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatAgeRange,
  isPersonEligibleForSelectedClass,
  personAgeAtSeasonStart,
} from './check-requirements';
import type { EnrolmentConstraints } from '../hooks/useEnrolmentContext';

export interface SelectedClassAgeValidation {
  /** True when DOB fails the selected class age band at season start. */
  blocked: boolean;
  studentAge: number | null;
  classAges: string | null;
}

export function useSelectedClassAgeValidation(
  constraints: EnrolmentConstraints,
  dateOfBirth: string,
): SelectedClassAgeValidation {
  return useMemo(() => {
    const classAges = constraints.ageBand
      ? formatAgeRange(constraints.ageBand.min_age, constraints.ageBand.max_age)
      : null;

    if (!dateOfBirth) {
      return { blocked: false, studentAge: null, classAges };
    }

    const eligible = isPersonEligibleForSelectedClass(
      dateOfBirth,
      constraints.ageBand,
      constraints.seasonStartDate,
    );

    if (eligible === null) {
      return { blocked: false, studentAge: null, classAges };
    }

    const studentAge = constraints.seasonStartDate
      ? personAgeAtSeasonStart(dateOfBirth, constraints.seasonStartDate)
      : null;

    return { blocked: !eligible, studentAge, classAges };
  }, [constraints, dateOfBirth]);
}

export function SelectedClassAgeAlert({
  constraints,
  dateOfBirth,
}: {
  constraints: EnrolmentConstraints;
  dateOfBirth: string;
}) {
  const { t } = useTranslation();
  const { blocked, studentAge, classAges } = useSelectedClassAgeValidation(constraints, dateOfBirth);

  if (!blocked || studentAge == null || !classAges) {
    return null;
  }

  return (
    <div
      className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-1"
      role="alert"
    >
      <p>{t('pages.enrolment.selected_class_age_mismatch', { age: studentAge, classAges })}</p>
      <p className="text-xs">{t('pages.enrolment.selected_class_age_ineligible_hint')}</p>
    </div>
  );
}

export function getSelectedClassAgeError(
  constraints: EnrolmentConstraints,
  dateOfBirth: string | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  if (!dateOfBirth) return null;

  const eligible = isPersonEligibleForSelectedClass(
    dateOfBirth,
    constraints.ageBand,
    constraints.seasonStartDate,
  );
  if (eligible !== false) return null;

  const studentAge = constraints.seasonStartDate
    ? personAgeAtSeasonStart(dateOfBirth, constraints.seasonStartDate)
    : null;
  const classAges = constraints.ageBand
    ? formatAgeRange(constraints.ageBand.min_age, constraints.ageBand.max_age)
    : null;

  if (studentAge == null || !classAges) {
    return t('pages.enrolment.ineligible_age');
  }

  return t('pages.enrolment.selected_class_age_mismatch', { age: studentAge, classAges });
}
