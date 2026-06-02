import type { ClassAgeContext } from './check-requirements';

/** Offerings with minimum age 18+ are self-enrolment (personal details only). */
export function isAdultOffering(ageBand: ClassAgeContext | null | undefined): boolean {
  return ageBand?.min_age != null && ageBand.min_age >= 18;
}
