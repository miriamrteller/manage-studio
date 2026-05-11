import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LevelService } from '../service';
import { type Level } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 50;

interface UseLevelsOptions {
  page?: number;
  enabled?: boolean;
}

export function useLevels({ page = 1, enabled = true }: UseLevelsOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['levels', tenant?.id, page],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return LevelService.list(tenant, { page, pageSize: PAGE_SIZE });
    },
    enabled: enabled && !!tenant?.id,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (newLevel: Partial<Level>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return LevelService.create(tenant, newLevel);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['levels', tenant?.id] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (level: Partial<Level>) => {
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
    createLevel: (level: Partial<Level>, callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      createMutation.mutate(level, {
        onSuccess: callbacks?.onSuccess,
        onError: callbacks?.onError,
      });
    },
    updateLevel: (level: Partial<Level>, callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
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
