import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EnrolmentService } from '../service';
import { type Enrolment } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 20;

interface UseEnrolmentOptions {
  termId?: string;
  personId?: string;
  status?: string;
  page?: number;
  enabled?: boolean;
}

/**
 * useEnrolment: Fetch and manage enrolments
 * 
 * Pattern: useQuery for reads + useMutation for writes + cache invalidation
 * Supports filtering by term, person, and status
 */
export function useEnrolment({
  termId,
  personId,
  status,
  page = 1,
  enabled = true,
}: UseEnrolmentOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['enrolments', tenant?.id, page, termId, personId, status],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return EnrolmentService.list(tenant, {
        page,
        pageSize: PAGE_SIZE,
        termId,
        personId,
        status,
      });
    },
    enabled: enabled && !!tenant?.id,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (newEnrolment: Partial<Enrolment>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return EnrolmentService.create(tenant, newEnrolment);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrolments', tenant?.id] });
    },
  });

  // Update mutation (status changes, prior_experience updates)
  const updateMutation = useMutation({
    mutationFn: async (enrolmentData: Partial<Enrolment>) => {
      if (!tenant || !enrolmentData.id) throw new Error('Tenant not initialized or missing enrolment ID');
      return EnrolmentService.update(tenant, enrolmentData.id, enrolmentData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrolments', tenant?.id] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (enrolmentId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return EnrolmentService.delete(tenant, enrolmentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrolments', tenant?.id] });
    },
  });

  return {
    enrolments: listQuery.data?.enrolments || [],
    total: listQuery.data?.total || 0,
    pageSize: PAGE_SIZE,
    isLoading: listQuery.isLoading,
    error: listQuery.error instanceof Error ? listQuery.error.message : 'Unknown error',
    createEnrolment: createMutation.mutate,
    updateEnrolment: updateMutation.mutate,
    deleteEnrolment: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
