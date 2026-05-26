import type { QueryClient } from '@tanstack/react-query';

/** Invalidate all list/detail queries that show family or guardian contact data. */
export function invalidateFamilyCaches(
  queryClient: QueryClient,
  tenantId: string,
  familyId: string,
) {
  void queryClient.invalidateQueries({ queryKey: ['family', tenantId, familyId] });
  void queryClient.invalidateQueries({ queryKey: ['family-people', tenantId, familyId] });
  void queryClient.invalidateQueries({ queryKey: ['family-members', tenantId, familyId] });
  void queryClient.invalidateQueries({ queryKey: ['student-detail-family', tenantId, familyId] });
  void queryClient.invalidateQueries({ queryKey: ['student-detail-members', tenantId, familyId] });
  void queryClient.invalidateQueries({ queryKey: ['students-list-families', tenantId] });
}
