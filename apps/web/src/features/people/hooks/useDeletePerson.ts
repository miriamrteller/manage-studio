import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PersonService } from '../service';
import { useTenant } from '@/hooks/useTenant';

interface UseDeletePersonOptions {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

/**
 * useDeletePerson: Mutation for deleting a person
 * - Uses PersonService for deletion
 * - Invalidates people queries on success
 * - Handles error callback for UI feedback
 */
export function useDeletePerson(options?: UseDeletePersonOptions) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (personId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return PersonService.delete(tenant, personId);
    },
    onSuccess: () => {
      // Invalidate all people queries for this tenant
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['people', tenant.id],
        });
      }
      options?.onSuccess?.();
    },
    onError: (error: unknown) => {
      options?.onError?.(error);
    },
  });
}
