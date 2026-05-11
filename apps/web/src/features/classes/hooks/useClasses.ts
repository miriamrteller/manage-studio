import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClassService } from '../service';
import { type Class } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 50;

interface UseClassesOptions {
  termId?: string;
  page?: number;
  enabled?: boolean;
}

/**
 * useClasses: Fetch and manage classes
 * 
 * Pattern: useQuery for reads + useMutation for writes + cache invalidation
 * TanStack Query handles caching and background refetching
 */
export function useClasses({ termId, page = 1, enabled = true }: UseClassesOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['classes', tenant?.id, page, termId],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return ClassService.list(tenant, { page, pageSize: PAGE_SIZE, termId });
    },
    enabled: enabled && !!tenant?.id,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (newClass: Partial<Class>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return ClassService.create(tenant, newClass);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes', tenant?.id] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (classData: Partial<Class>) => {
      if (!tenant || !classData.id) throw new Error('Tenant not initialized or missing class ID');
      return ClassService.update(tenant, classData.id, classData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes', tenant?.id] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (classId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return ClassService.delete(tenant, classId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes', tenant?.id] });
    },
  });

  return {
    classes: listQuery.data?.classes || [],
    total: listQuery.data?.total || 0,
    pageSize: PAGE_SIZE,
    isLoading: listQuery.isLoading,
    error: listQuery.error instanceof Error ? listQuery.error.message : 'Unknown error',
    createClass: createMutation.mutate,
    updateClass: updateMutation.mutate,
    deleteClass: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
