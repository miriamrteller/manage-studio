import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PersonService } from '../service';
import { type Person } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 20;

// Schema source: SPEC.md Migration 002
// Query list of people for current tenant with pagination
// Create/update/delete mutations with automatic cache invalidation
// All queries filtered by tenant_id (RLS + application logic)

interface UsePeopleOptions {
  page?: number;
  enabled?: boolean;
}

export function usePeople({ page = 1, enabled = true }: UsePeopleOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['people', tenant?.id, page],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return PersonService.list(tenant, { page, pageSize: PAGE_SIZE });
    },
    enabled: enabled && !!tenant?.id,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (newPersonData: Partial<Person>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return PersonService.create(tenant, newPersonData);
    },
    onSuccess: () => {
      // Invalidate all people queries for this tenant
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['people', tenant.id],
        });
      }
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (updatedPerson: Partial<Person> & { id: string }) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return PersonService.update(tenant, updatedPerson.id, updatedPerson);
    },
    onSuccess: () => {
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['people', tenant.id],
        });
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (personId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return PersonService.delete(tenant, personId);
    },
    onSuccess: () => {
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['people', tenant.id],
        });
      }
    },
  });

  return {
    // Query results
    people: listQuery.data?.people || [],
    total: listQuery.data?.total || 0,
    page,
    pageSize: PAGE_SIZE,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    error: listQuery.error,

    // Mutations
    createPerson: createMutation.mutate,
    updatePerson: updateMutation.mutate,
    deletePerson: deleteMutation.mutate,

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    createError: createMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,
  };
}
