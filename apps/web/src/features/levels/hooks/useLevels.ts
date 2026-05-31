import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LevelService, type CategorySortField } from '../service';
import { type Category } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';
import type { SortOrder } from '@/lib/list-query';
import { DEFAULT_LEVEL_SORT } from '../service';

const PAGE_SIZE = 50;

interface UseLevelsOptions {
  page?: number;
  searchQuery?: string;
  sortField?: CategorySortField;
  sortOrder?: SortOrder;
  enabled?: boolean;
}

export function useLevels({
  page = 1,
  searchQuery = '',
  sortField = DEFAULT_LEVEL_SORT.field,
  sortOrder = DEFAULT_LEVEL_SORT.order,
  enabled = true,
}: UseLevelsOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['levels', tenant?.id, page, searchQuery, sortField, sortOrder],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return LevelService.list(tenant, {
        page,
        pageSize: PAGE_SIZE,
        searchQuery,
        sortField,
        sortOrder,
      });
    },
    enabled: enabled && !!tenant?.id,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (newLevel: Partial<Category>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return LevelService.create(tenant, newLevel);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['levels', tenant?.id] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (level: Partial<Category>) => {
      if (!tenant || !level.id) throw new Error('Tenant not initialized or missing level ID');
      return LevelService.update(tenant, level.id, level);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['levels', tenant?.id] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (levelId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return LevelService.delete(tenant, levelId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['levels', tenant?.id] });
    },
  });

  return {
    levels: listQuery.data?.levels || [],
    total: listQuery.data?.total || 0,
    pageSize: PAGE_SIZE,
    isLoading: listQuery.isLoading,
    error: listQuery.error as Error | null,
    createLevel: (level: Partial<Category>, callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      createMutation.mutate(level, {
        onSuccess: callbacks?.onSuccess,
        onError: callbacks?.onError,
      });
    },
    updateLevel: (level: Partial<Category>, callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      updateMutation.mutate(level, {
        onSuccess: callbacks?.onSuccess,
        onError: callbacks?.onError,
      });
    },
    deleteLevel: (levelId: string, callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      deleteMutation.mutate(levelId, {
        onSuccess: callbacks?.onSuccess,
        onError: callbacks?.onError,
      });
    },
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
