import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FamilyService } from '../service';
import { type Family } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 20;

// Schema source: SPEC.md Migration 002
// Query list of families for current tenant with pagination
// Create/update/delete mutations with automatic cache invalidation
// All queries filtered by tenant_id (RLS + application logic)

interface UseFamiliesOptions {
  page?: number;
  enabled?: boolean;
}

export function useFamilies({ page = 1, enabled = true }: UseFamiliesOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['families', tenant?.id, page],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return FamilyService.list(tenant, { page, pageSize: PAGE_SIZE });
    },
    enabled: enabled && !!tenant?.id,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (newFamilyData: Partial<Family>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return FamilyService.create(tenant, newFamilyData);
    },
    onSuccess: () => {
      // Invalidate all families queries for this tenant
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['families', tenant.id],
        });
      }
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (updatedFamily: Partial<Family> & { id: string }) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return FamilyService.update(tenant, updatedFamily.id, updatedFamily);
    },
    onSuccess: () => {
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['families', tenant.id],
        });
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (familyId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return FamilyService.delete(tenant, familyId);
    },
    onSuccess: () => {
      if (tenant?.id) {
        queryClient.invalidateQueries({
          queryKey: ['families', tenant.id],
        });
      }
    },
  });

  return {
    // Query results
    families: listQuery.data?.families || [],
    total: listQuery.data?.total || 0,
    page,
    pageSize: PAGE_SIZE,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    error: listQuery.error,

    // Mutations
    createFamily: createMutation.mutate,
    updateFamily: updateMutation.mutate,
    deleteFamily: deleteMutation.mutate,

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    createError: createMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,
  };
}
