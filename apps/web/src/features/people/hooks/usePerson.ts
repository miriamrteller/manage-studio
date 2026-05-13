import { useQuery } from '@tanstack/react-query';
import { PersonService } from '../service';
import { useTenant } from '@/hooks/useTenant';

interface UsePersonOptions {
  enabled?: boolean;
}

/**
 * usePerson: Fetch a single person by ID
 * - Uses PersonService for data operations
 * - Validates response with PersonSchema
 * - Enables based on tenant + person ID availability
 */
export function usePerson(
  personId: string | null | undefined,
  { enabled = true }: UsePersonOptions = {}
) {
  const tenant = useTenant();

  return useQuery({
    queryKey: ['person', tenant?.id, personId],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      if (!personId) throw new Error('Person ID required');
      return PersonService.get(tenant, personId);
    },
    enabled: enabled && !!tenant?.id && !!personId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}
