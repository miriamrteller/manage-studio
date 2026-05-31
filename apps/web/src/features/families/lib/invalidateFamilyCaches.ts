import type { QueryClient } from '@tanstack/react-query';
import type { Account, AccountMember } from '@shared/schemas';

type AccountContactFields = Pick<
  Account,
  'contact_person_name' | 'contact_email' | 'contact_phone'
>;

function contactFields(family: Account): AccountContactFields {
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
  family: Account,
) {
  const patch = contactFields(family);

  queryClient.setQueryData(['family', tenantId, family.id], family);
  queryClient.setQueryData(['student-detail-family', tenantId, family.id], family);

  queryClient.setQueriesData<Array<{ id: string } & AccountContactFields>>(
    { queryKey: ['students-list-families', tenantId] },
    (old) => {
      if (!old) return old;
      return old.map((row) => (row.id === family.id ? { ...row, ...patch } : row));
    },
  );

  queryClient.setQueriesData<{ families: Account[]; total: number }>(
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

  queryClient.setQueriesData<Account[]>(
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
  members: AccountMember[],
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
  family: Account,
  members: AccountMember[],
) {
  syncFamilyContactInCache(queryClient, tenantId, family);
  syncFamilyMembersInCache(queryClient, tenantId, family.id, members);
  await invalidateFamilyCaches(queryClient, tenantId, family.id);
}
