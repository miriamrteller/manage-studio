/** Mirrors apps/web/src/features/enrolment/lib/check-requirements.ts isAgeEligible */

export interface AgeCheckPerson {
  date_of_birth?: string | null;
}

export interface AgeCheckOffering {
  min_age?: number | null;
  max_age?: number | null;
  season_start_date?: string | null;
}

function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function ageAt(dateOfBirth: string, referenceDate: Date): number {
  const dob = parseLocalDate(dateOfBirth);
  let age = referenceDate.getFullYear() - dob.getFullYear();
  const monthDiff = referenceDate.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export function isAgeEligible(
  offering: AgeCheckOffering,
  person: AgeCheckPerson,
): boolean | null {
  if (!person.date_of_birth) return null;

  if (offering.min_age == null && offering.max_age == null) return true;

  const ref = offering.season_start_date
    ? parseLocalDate(offering.season_start_date)
    : null;
  if (!ref || Number.isNaN(ref.getTime())) return true;

  const age = ageAt(person.date_of_birth, ref);
  if (Number.isNaN(age)) return true;

  if (offering.min_age != null && age < offering.min_age) return false;
  if (offering.max_age != null && age > offering.max_age) return false;
  return true;
}
