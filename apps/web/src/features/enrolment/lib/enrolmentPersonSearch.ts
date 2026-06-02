import type { PersonSearchResult } from '@/features/people/types';
import type { EnrolmentConstraints } from '../hooks/useEnrolmentContext';
import { filterStudentCandidates } from './filterStudentCandidates';

export function isEnrolmentGuardianOnly(
  result: PersonSearchResult,
  isAdultIntake: boolean,
): boolean {
  if (isAdultIntake) return false;
  return Boolean(result.isAccountHolder && result.familyAccountId);
}

export function filterEnrolmentPersonSearchResults(
  results: PersonSearchResult[],
  constraints: EnrolmentConstraints,
): PersonSearchResult[] {
  const people = results.map((r) => r.person);
  const { eligible, ineligible } = filterStudentCandidates(
    people,
    {
      accountId: constraints.accountId,
      ageBand: constraints.ageBand,
    },
    null,
    { includeAdultSolo: true },
  );
  const visibleIds = new Set([
    ...eligible.map((p) => p.id),
    ...ineligible.map((item) => item.person.id),
    ...results.filter((r) => r.isAccountHolder).map((r) => r.person.id),
  ]);
  return results.filter((r) => visibleIds.has(r.person.id));
}

export function isEnrolmentPersonSearchSelectable(
  result: PersonSearchResult,
  constraints: EnrolmentConstraints,
  isAdultIntake = false,
): boolean {
  if (isEnrolmentGuardianOnly(result, isAdultIntake)) {
    return Boolean(result.familyAccountId);
  }

  const { eligible } = filterStudentCandidates(
    [result.person],
    {
      accountId: constraints.accountId,
      ageBand: constraints.ageBand,
    },
    null,
    { includeAdultSolo: true },
  );
  return eligible.length > 0;
}
