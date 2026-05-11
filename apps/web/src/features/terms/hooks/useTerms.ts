import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TermService } from '../service';
import { type Term } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';

const PAGE_SIZE = 50;

interface UseTermsOptions {
  page?: number;
  enabled?: boolean;
}

export function useTerms({ page = 1, enabled = true }: UseTermsOptions = {}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['terms', tenant?.id, page],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return TermService.list(tenant, { page, pageSize: PAGE_SIZE });
    },
    enabled: enabled && !!tenant?.id,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (newTerm: Partial<Term>) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return TermService.create(tenant, newTerm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms', tenant?.id] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (term: Partial<Term>) => {
      if (!tenant || !term.id) throw new Error('Tenant not initialized or missing term ID');
      return TermService.update(tenant, term.id, term);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms', tenant?.id] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (termId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return TermService.delete(tenant, termId);
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
    createTerm: (term: Partial<Term>, callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      createMutation.mutate(term, {
        onSuccess: callbacks?.onSuccess,
        onError: callbacks?.onError,
      });
    },
    updateTerm: (term: Partial<Term>, callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      updateMutation.mutate(term, {
        onSuccess: callbacks?.onSuccess,
        onError: callbacks?.onError,
      });
    },
    deleteTerm: (termId: string, callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      deleteMutation.mutate(termId, {
        onSuccess: callbacks?.onSuccess,
        onError: callbacks?.onError,
      });
    },
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
