import type { QueryClient } from '@tanstack/react-query';
import type { AccountMemberWithPerson } from '../service';
import { type AccountWithContact, type GuardianContactFields } from './accountContact';

function contactFields(family: AccountWithContact): GuardianContactFields {
  return {
    contact_person_name: family.contact_person_name,
    contact_email: family.contact_email,
    contact_phone: family.contact_phone,
  };
}

/** Immediately update family contact data in all caches that siblings may read from. */
export function syncFamilyContactInCache(
  queryClient: QueryClient,
  tenantId: string,
  family: AccountWithContact,
) {
  const patch = contactFields(family);

  queryClient.setQueryData(['family', tenantId, family.id], family);
  queryClient.setQueryData(['student-detail-family', tenantId, family.id], family);

  queryClient.setQueriesData<Array<{ id: string } & GuardianContactFields>>(
    { queryKey: ['students-list-families', tenantId] },
    (old) => {
      if (!old) return old;
      return old.map((row) => (row.id === family.id ? { ...row, ...patch } : row));
    },
  );

  queryClient.setQueriesData<{ families: AccountWithContact[]; total: number }>(
    { queryKey: ['families', tenantId] },
    (old) => {
      if (!old) return old;
      return {
        ...old,
        families: old.families.map((row) =>
          row.id === family.id ? { ...row, ...patch } : row,
        ),
      };
    },
  );

  queryClient.setQueriesData<AccountWithContact[]>(
    { queryKey: ['familySearch', tenantId] },
    (old) => {
      if (!old) return old;
      return old.map((row) => (row.id === family.id ? { ...row, ...patch } : row));
    },
  );
}

export function syncFamilyMembersInCache(
  queryClient: QueryClient,
  tenantId: string,
  familyId: string,
  members: AccountMemberWithPerson[],
) {
  queryClient.setQueryData(['family-members', tenantId, familyId], members);
  queryClient.setQueryData(['student-detail-members', tenantId, familyId], members);
}

/** Invalidate all list/detail queries that show family or guardian contact data. */
export async function invalidateFamilyCaches(
  queryClient: QueryClient,
  tenantId: string,
  familyId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['family', tenantId, familyId] }),
    queryClient.invalidateQueries({ queryKey: ['family-people', tenantId, familyId] }),
    queryClient.invalidateQueries({ queryKey: ['family-members', tenantId, familyId] }),
    queryClient.invalidateQueries({ queryKey: ['student-detail-family', tenantId, familyId] }),
    queryClient.invalidateQueries({ queryKey: ['student-detail-guardian', tenantId] }),
    queryClient.invalidateQueries({ queryKey: ['student-detail-members', tenantId, familyId] }),
    queryClient.invalidateQueries({ queryKey: ['students-list-families', tenantId] }),
    queryClient.invalidateQueries({ queryKey: ['families', tenantId] }),
    queryClient.invalidateQueries({ queryKey: ['familySearch', tenantId] }),
  ]);
}

/** Push updated family + members into cache, then refetch related queries. */
export async function refreshFamilyCaches(
  queryClient: QueryClient,
  tenantId: string,
  family: AccountWithContact,
  members: AccountMemberWithPerson[],
) {
  syncFamilyContactInCache(queryClient, tenantId, family);
  syncFamilyMembersInCache(queryClient, tenantId, family.id, members);
  await invalidateFamilyCaches(queryClient, tenantId, family.id);
}
