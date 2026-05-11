import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SessionService } from '../service';
import { type ClassSession } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 50;

interface UseSessionsOptions {
  classId?: string;
  page?: number;
  enabled?: boolean;
}

/**
 * useSessions: Fetch and manage class sessions
 * 
 * Pattern: useQuery for reads + useMutation for writes + cache invalidation
 * TanStack Query handles caching and background refetching
 */
export function useSessions({ classId, page = 1, enabled = true }: UseSessionsOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['sessions', tenant?.id, page, classId],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return SessionService.list(tenant, { page, pageSize: PAGE_SIZE, classId });
    },
    enabled: enabled && !!tenant?.id,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (newSession: Partial<ClassSession>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return SessionService.create(tenant, newSession);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', tenant?.id] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (sessionData: Partial<ClassSession>) => {
      if (!tenant || !sessionData.id) throw new Error('Tenant not initialized or missing session ID');
      return SessionService.update(tenant, sessionData.id, sessionData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', tenant?.id] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return SessionService.delete(tenant, sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions', tenant?.id] });
    },
  });

  return {
    sessions: listQuery.data?.sessions || [],
    total: listQuery.data?.total || 0,
    pageSize: PAGE_SIZE,
    isLoading: listQuery.isLoading,
    error: listQuery.error instanceof Error ? listQuery.error.message : 'Unknown error',
    createSession: createMutation.mutate,
    updateSession: updateMutation.mutate,
    deleteSession: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
