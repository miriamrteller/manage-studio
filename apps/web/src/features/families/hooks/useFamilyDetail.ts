import { useQuery } from '@tanstack/react-query';
import { FamilyService } from '../service';
import { useTenant } from '@/hooks/useTenant';

export function useFamilyDetail(familyId: string) {
  const tenant = useTenant();

  const familyQuery = useQuery({
    queryKey: ['family', tenant?.id, familyId],
    queryFn: () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return FamilyService.get(tenant, familyId);
    },
    enabled: !!tenant?.id && !!familyId,
  });

  const peopleQuery = useQuery({
    queryKey: ['family-people', tenant?.id, familyId],
    queryFn: () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return FamilyService.getPeople(tenant, familyId);
    },
    enabled: !!tenant?.id && !!familyId,
  });

  const membersQuery = useQuery({
    queryKey: ['family-members', tenant?.id, familyId],
    queryFn: () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return FamilyService.getMembers(tenant, familyId);
    },
    enabled: !!tenant?.id && !!familyId,
  });

  return {
    family: familyQuery.data,
    people: peopleQuery.data ?? [],
    members: membersQuery.data ?? [],
    isLoading: familyQuery.isLoading,
    error: familyQuery.error,
  };
}
