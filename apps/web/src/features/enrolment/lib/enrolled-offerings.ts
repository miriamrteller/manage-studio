import { NON_TERMINAL_ENGAGEMENT_STATUSES } from './enrolmentTransitions';
import type { Engagement } from '@shared/schemas';

/** Statuses that block creating another enrolment for the same class + term. */
export const ENROLMENT_BLOCKING_DUPLICATE_STATUSES = [
  ...NON_TERMINAL_ENGAGEMENT_STATUSES,
  'pending_waiver',
] as const;

export function buildEnrolledOfferingKey(offeringId: string, seasonId: string): string {
  return `${offeringId}:${seasonId}`;
}

export function isOfferingEnrolled(
  enrolledKeys: Set<string> | undefined,
  offeringId: string,
  seasonId: string | null | undefined,
): boolean {
  if (!enrolledKeys?.size || !seasonId) return false;
  return enrolledKeys.has(buildEnrolledOfferingKey(offeringId, seasonId));
}

export function buildEnrolledOfferingKeys(enrolments: Engagement[]): Set<string> {
  const keys = new Set<string>();
  for (const enrolment of enrolments) {
    if (!(ENROLMENT_BLOCKING_DUPLICATE_STATUSES as readonly string[]).includes(enrolment.status)) {
      continue;
    }
    if (enrolment.offering_id && enrolment.season_id) {
      keys.add(buildEnrolledOfferingKey(enrolment.offering_id, enrolment.season_id));
    }
  }
  return keys;
}

export function mergeClassesWithEnrolled<T extends { id: string; season_id?: string | null }>(
  displayClasses: T[],
  allClasses: T[],
  enrolledKeys: Set<string> | undefined,
): T[] {
  if (!enrolledKeys?.size) return displayClasses;

  const seen = new Set(displayClasses.map((cls) => cls.id));
  const extras = allClasses.filter(
    (cls) => !seen.has(cls.id) && isOfferingEnrolled(enrolledKeys, cls.id, cls.season_id),
  );

  return extras.length ? [...displayClasses, ...extras] : displayClasses;
}
