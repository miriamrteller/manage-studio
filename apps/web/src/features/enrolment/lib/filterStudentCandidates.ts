import type { Person } from '@shared/schemas';
import { isAgeEligible, ageAt, type ClassAgeContext } from './check-requirements';

export interface StudentCandidateConstraints {
  accountId?: string;
  ageBand?: ClassAgeContext | null;
  excludePersonIds?: string[];
}

export interface FilteredStudentCandidates {
  eligible: Person[];
  ineligible: Array<{ person: Person; reason: 'age' | 'account' }>;
}

/** Active students linked to an account (excludes guardian's own person row). */
export function isStudentCandidate(
  person: Person,
  guardianPersonId?: string | null,
): boolean {
  if (person.status !== 'active') return false;
  if (guardianPersonId && person.id === guardianPersonId) return false;
  return person.account_id != null;
}

export function filterStudentCandidates<T extends Person>(
  people: T[],
  constraints: StudentCandidateConstraints,
  guardianPersonId?: string | null,
): { eligible: T[]; ineligible: Array<{ person: T; reason: 'age' | 'account' }> } {
  const eligible: T[] = [];
  const ineligible: Array<{ person: T; reason: 'age' | 'account' }> = [];

  for (const person of people) {
    if (!isStudentCandidate(person, guardianPersonId)) {
      continue;
    }

    if (constraints.accountId && person.account_id !== constraints.accountId) {
      ineligible.push({ person, reason: 'account' });
      continue;
    }

    if (
      constraints.ageBand &&
      (constraints.ageBand.min_age != null || constraints.ageBand.max_age != null) &&
      person.date_of_birth &&
      !isAgeEligible(constraints.ageBand, person)
    ) {
      ineligible.push({ person, reason: 'age' });
      continue;
    }

    if (constraints.excludePersonIds?.includes(person.id)) {
      continue;
    }

    eligible.push(person);
  }

  return { eligible, ineligible };
}

export function studentAgeLabel(dateOfBirth: string | null | undefined): string | null {
  if (!dateOfBirth) return null;
  const age = ageAt(dateOfBirth);
  return Number.isNaN(age) ? null : String(age);
}
