import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequirementService } from '../service';
import { type ClassRequirement } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 50;

interface UseRequirementsOptions {
  classId?: string;
  page?: number;
  enabled?: boolean;
}

/**
 * useRequirements: Fetch and manage class requirements
 * 
 * Pattern: useQuery for reads + useMutation for writes + cache invalidation
 * TanStack Query handles caching and background refetching
 */
export function useRequirements({ classId, page = 1, enabled = true }: UseRequirementsOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['requirements', tenant?.id, page, classId],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return RequirementService.list(tenant, { page, pageSize: PAGE_SIZE, classId });
    },
    enabled: enabled && !!tenant?.id,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (newRequirement: Partial<ClassRequirement>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return RequirementService.create(tenant, newRequirement);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', tenant?.id] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (requirementData: Partial<ClassRequirement>) => {
      if (!tenant || !requirementData.id) throw new Error('Tenant not initialized or missing requirement ID');
      return RequirementService.update(tenant, requirementData.id, requirementData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', tenant?.id] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (requirementId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return RequirementService.delete(tenant, requirementId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', tenant?.id] });
    },
  });

  return {
    requirements: listQuery.data?.requirements || [],
    total: listQuery.data?.total || 0,
    pageSize: PAGE_SIZE,
    isLoading: listQuery.isLoading,
    error: listQuery.error instanceof Error ? listQuery.error.message : 'Unknown error',
    createRequirement: createMutation.mutate,
    updateRequirement: updateMutation.mutate,
    deleteRequirement: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
