import type { TFunction } from 'i18next';

/** Parse YYYY-MM-DD as a local calendar date (avoids UTC timezone drift). */
export function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

/** Age in whole years on a reference date (default: today). */
export function ageAt(dateOfBirth: string, reference = new Date()): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  if (!y || !m || !d) return NaN;

  let age = reference.getFullYear() - y;
  const refMonth = reference.getMonth() + 1;
  const refDay = reference.getDate();
  if (refMonth < m || (refMonth === m && refDay < d)) age--;
  return age;
}

export const ADULT_AGE_THRESHOLD = 18;

export function isAdultAge(age: number): boolean {
  return age >= ADULT_AGE_THRESHOLD;
}

/** User-facing age for a person row (never a specific number above 17). */
export function formatPersonAgeLabel(age: number, t: TFunction): string {
  if (isAdultAge(age)) return t('pages.students.age_adult');
  return String(age);
}

export function personAgeLabel(dateOfBirth: string | null | undefined): string | null {
  if (!dateOfBirth) return null;
  const age = ageAt(dateOfBirth);
  if (Number.isNaN(age)) return null;
  if (isAdultAge(age)) return null;
  return String(age);
}

export function personAgeDisplayLabel(
  dateOfBirth: string | null | undefined,
  t: TFunction,
): string | null {
  if (!dateOfBirth) return null;
  const age = ageAt(dateOfBirth);
  if (Number.isNaN(age)) return null;
  return formatPersonAgeLabel(age, t);
}

export function enrolmentShowingForAgeMessage(studentAge: number, t: TFunction): string {
  if (isAdultAge(studentAge)) {
    return t('pages.enrolment.showing_for_age_18_plus');
  }
  return t('pages.enrolment.showing_for_age', { age: studentAge });
}

export function enrolmentAgeMismatchMessage(
  studentAge: number,
  classAges: string,
  t: TFunction,
): string {
  if (isAdultAge(studentAge)) {
    return t('pages.enrolment.selected_class_age_mismatch_adult', { classAges });
  }
  return t('pages.enrolment.selected_class_age_mismatch', { age: studentAge, classAges });
}

export function enrolmentNoClassesAgeHint(studentAge: number, t: TFunction): string {
  if (isAdultAge(studentAge)) {
    return t('pages.enrolment.no_classes_for_age_hint_adult');
  }
  return t('pages.enrolment.no_classes_for_age_hint', { age: studentAge });
}

/** Inline age line for enrolment student pickers (e.g. "Age 5" or "Adult"). */
export function formatEnrolmentStudentAgeLine(
  dateOfBirth: string | null | undefined,
  t: TFunction,
): string | null {
  if (!dateOfBirth) return null;
  const age = ageAt(dateOfBirth);
  if (Number.isNaN(age)) return null;
  if (isAdultAge(age)) return t('pages.students.age_adult');
  return t('pages.enrolment.student_age', { age });
}

/** Inline age line for person search (e.g. "Age 5" or "Adult"). */
export function formatPersonSearchAgeLine(
  dateOfBirth: string | null | undefined,
  t: TFunction,
): string | null {
  if (!dateOfBirth) return null;
  const age = ageAt(dateOfBirth);
  if (Number.isNaN(age)) return null;
  if (isAdultAge(age)) return t('person_search.adult');
  return t('person_search.age', { age });
}
