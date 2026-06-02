import type { Person } from '@shared/schemas';
import { isAgeEligible, type ClassAgeContext } from './check-requirements';
import { personAgeLabel } from '@/lib/personAge';

export interface StudentCandidateConstraints {
  accountId?: string;
  ageBand?: ClassAgeContext | null;
  excludePersonIds?: string[];
}

export interface FilteredStudentCandidates {
  eligible: Person[];
  ineligible: Array<{ person: Person; reason: 'age' | 'account' }>;
}

export interface StudentCandidateOptions {
  /** Admin search includes adult solo students (no family account). */
  includeAdultSolo?: boolean;
}

/** Active students linked to an account (excludes guardian's own person row). */
export function isStudentCandidate(
  person: Person,
  guardianPersonId?: string | null,
  options?: StudentCandidateOptions,
): boolean {
  if (person.status !== 'active') return false;
  if (guardianPersonId && person.id === guardianPersonId) return false;
  if (person.account_id != null) return true;
  return options?.includeAdultSolo === true;
}

export function filterStudentCandidates<T extends Person>(
  people: T[],
  constraints: StudentCandidateConstraints,
  guardianPersonId?: string | null,
  options?: StudentCandidateOptions,
): { eligible: T[]; ineligible: Array<{ person: T; reason: 'age' | 'account' }> } {
  const eligible: T[] = [];
  const ineligible: Array<{ person: T; reason: 'age' | 'account' }> = [];

  for (const person of people) {
    if (!isStudentCandidate(person, guardianPersonId, options)) {
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
  return personAgeLabel(dateOfBirth);
}
