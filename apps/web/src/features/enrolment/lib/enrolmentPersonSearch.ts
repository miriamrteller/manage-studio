import type { PersonSearchResult } from '@/features/people/types';
import type { EnrolmentConstraints } from '../hooks/useEnrolmentContext';
import { filterStudentCandidates } from './filterStudentCandidates';

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
  ]);
  return results.filter((r) => visibleIds.has(r.person.id));
}

export function isEnrolmentPersonSearchSelectable(
  result: PersonSearchResult,
  constraints: EnrolmentConstraints,
): boolean {
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
