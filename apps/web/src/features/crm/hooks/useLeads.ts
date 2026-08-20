import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { LeadService, type LeadCreateInput, type LeadStage } from '../services/leadService';

export function useLeads() {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['leads', tenant?.id],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return LeadService.list(tenant);
    },
    enabled: !!tenant?.id,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['leads', tenant?.id] });

  const createMutation = useMutation({
    mutationFn: async (input: LeadCreateInput) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return LeadService.create(tenant, input);
    },
    onSuccess: invalidate,
  });

  const stageMutation = useMutation({
    mutationFn: async (params: { id: string; stage: LeadStage }) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return LeadService.updateStage(tenant, params.id, params.stage);
    },
    onSuccess: invalidate,
  });

  return {
    leads: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error as Error | null,
    createLead: createMutation.mutate,
    isCreating: createMutation.isPending,
    updateStage: stageMutation.mutate,
    isUpdatingStage: stageMutation.isPending,
  };
}
