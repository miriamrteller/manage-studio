import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TermService, type SeasonSortField, DEFAULT_TERM_SORT } from '../service';
import { type Season } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';
import type { SortOrder } from '@/lib/list-query';

const PAGE_SIZE = 50;

interface UseTermsOptions {
  page?: number;
  searchQuery?: string;
  statuses?: string[];
  sortField?: SeasonSortField;
  sortOrder?: SortOrder;
  enabled?: boolean;
}

export function useTerms({
  page = 1,
  searchQuery = '',
  statuses = [],
  sortField = DEFAULT_TERM_SORT.field,
  sortOrder = DEFAULT_TERM_SORT.order,
  enabled = true,
}: UseTermsOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['terms', tenant?.id, page, searchQuery, statuses, sortField, sortOrder],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return TermService.list(tenant, {
        page,
        pageSize: PAGE_SIZE,
        searchQuery,
        statuses,
        sortField,
        sortOrder,
      });
    },
    enabled: enabled && !!tenant?.id,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (newTerm: Partial<Season>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return TermService.create(tenant, newTerm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms', tenant?.id] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (term: Partial<Season>) => {
      if (!tenant || !term.id) throw new Error('Tenant not initialized or missing term ID');
      return TermService.update(tenant, term.id, term);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms', tenant?.id] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (seasonId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return TermService.delete(tenant, seasonId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms', tenant?.id] });
    },
  });

  return {
    terms: listQuery.data?.terms || [],
    total: listQuery.data?.total || 0,
    pageSize: PAGE_SIZE,
    isLoading: listQuery.isLoading,
    error: listQuery.error as Error | null,
    createTerm: (term: Partial<Season>, callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      createMutation.mutate(term, {
        onSuccess: callbacks?.onSuccess,
        onError: callbacks?.onError,
      });
    },
    updateTerm: (term: Partial<Season>, callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      updateMutation.mutate(term, {
        onSuccess: callbacks?.onSuccess,
        onError: callbacks?.onError,
      });
    },
    deleteTerm: (seasonId: string, callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      deleteMutation.mutate(seasonId, {
        onSuccess: callbacks?.onSuccess,
        onError: callbacks?.onError,
      });
    },
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
