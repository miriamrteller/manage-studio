import type { OfferingRequirementWithTemplate } from '@/features/classes/requirements/service';
import { ageAt, parseLocalDate } from '@/lib/personAge';

export { ageAt };

export interface PersonContext {
  date_of_birth?: string | null;
}

export interface ClassAgeContext {
  min_age?: number | null;
  max_age?: number | null;
  season_id?: string | null;
  season_start_date?: string | null;
}

export interface AgeCheckOptions {
  /** Explicit reference date (e.g. pre-selected class season start). */
  referenceDate?: Date | string;
  /** season_id → start_date map for per-class age checks. */
  seasonStartById?: Record<string, string>;
}

export function buildSeasonStartById(
  terms: Array<{ id: string; start_date?: string | null }>,
): Record<string, string> {
  return Object.fromEntries(
    terms
      .filter((term): term is { id: string; start_date: string } => Boolean(term.start_date))
      .map((term) => [term.id, term.start_date]),
  );
}

function resolveAgeReferenceDate(
  cls: ClassAgeContext,
  options?: AgeCheckOptions,
): Date | null {
  if (options?.referenceDate) {
    const ref =
      typeof options.referenceDate === 'string'
        ? parseLocalDate(options.referenceDate)
        : options.referenceDate;
    return Number.isNaN(ref.getTime()) ? null : ref;
  }
  if (cls.season_start_date) {
    const ref = parseLocalDate(cls.season_start_date);
    return Number.isNaN(ref.getTime()) ? null : ref;
  }
  if (cls.season_id && options?.seasonStartById?.[cls.season_id]) {
    const ref = parseLocalDate(options.seasonStartById[cls.season_id]);
    return Number.isNaN(ref.getTime()) ? null : ref;
  }
  return null;
}

export function classHasAgeBand(cls: ClassAgeContext): boolean {
  return cls.min_age != null || cls.max_age != null;
}

export function anyClassHasAgeBand(classes: ClassAgeContext[]): boolean {
  return classes.some(classHasAgeBand);
}

/**
 * When DOB is known, only classes with a defined age band that includes the student are eligible.
 * Classes with no min_age AND no max_age are not eligible (caller should skip filtering if no class has ages).
 */
export function isAgeEligible(
  cls: ClassAgeContext,
  person: PersonContext,
  options?: AgeCheckOptions,
): boolean {
  if (!person.date_of_birth) return true;

  if (cls.min_age == null && cls.max_age == null) return false;

  const ref = resolveAgeReferenceDate(cls, options);
  if (!ref) return true;

  const age = ageAt(person.date_of_birth, ref);
  if (Number.isNaN(age)) return true;

  if (cls.min_age != null && age < cls.min_age) return false;
  if (cls.max_age != null && age > cls.max_age) return false;
  return true;
}

/** Filter classes by age when at least one class has an age band configured. */
export function filterClassesByAge<T extends ClassAgeContext>(
  classes: T[],
  person: PersonContext,
  options?: AgeCheckOptions,
): { classes: T[]; ageFilteringActive: boolean } {
  if (!person.date_of_birth) {
    return { classes, ageFilteringActive: false };
  }
  if (!anyClassHasAgeBand(classes)) {
    return { classes, ageFilteringActive: false };
  }
  return {
    classes: classes.filter((cls) => isAgeEligible(cls, person, options)),
    ageFilteringActive: true,
  };
}

/** Collect human-readable requirement notes for informational display only. */
export function getRequirementInfoNotes(
  requirements: OfferingRequirementWithTemplate[],
): string[] {
  return requirements
    .map((r) => r.requirement_templates?.display_text)
    .filter((text): text is string => Boolean(text?.trim()));
}

export function formatAgeRange(minAge?: number | null, maxAge?: number | null): string | null {
  if (minAge != null && maxAge != null) return `${minAge}–${maxAge}`;
  if (minAge != null) return `${minAge}+`;
  if (maxAge != null) return `up to ${maxAge}`;
  return null;
}

/** e.g. "Primary (ages 5–6)" */
export function formatLevelWithAge(
  levelName: string | null | undefined,
  minAge?: number | null,
  maxAge?: number | null,
  agesLabel = 'ages',
): string | null {
  const ages = formatAgeRange(minAge, maxAge);
  if (levelName && ages) return `${levelName} (${agesLabel} ${ages})`;
  if (levelName) return levelName;
  if (ages) return `${agesLabel} ${ages}`;
  return null;
}

export function coerceAge(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function classAgeBandConfigured(ageBand?: ClassAgeContext | null): boolean {
  return ageBand != null && (ageBand.min_age != null || ageBand.max_age != null);
}

export function personAgeAtSeasonStart(
  dateOfBirth: string,
  seasonStartDate: string,
): number | null {
  const age = ageAt(dateOfBirth, parseLocalDate(seasonStartDate));
  return Number.isNaN(age) ? null : age;
}

/**
 * Returns null when age cannot be validated yet (missing DOB, age band, or season start).
 * Returns true/false when validation is possible.
 */
export function isPersonEligibleForSelectedClass(
  dateOfBirth: string | null | undefined,
  ageBand: ClassAgeContext | null | undefined,
  seasonStartDate: string | null | undefined,
): boolean | null {
  if (!dateOfBirth || !classAgeBandConfigured(ageBand) || !seasonStartDate) {
    return null;
  }
  return isAgeEligible(ageBand!, { date_of_birth: dateOfBirth }, {
    referenceDate: seasonStartDate,
  });
}
