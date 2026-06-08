import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WaiverService } from '../service';
import { useTenant } from '@/hooks/useTenant';

const TEMPLATES_KEY = 'waiver-templates';

export function useWaiverTemplates() {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: [TEMPLATES_KEY, tenant?.id],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return WaiverService.listTemplates(tenant);
    },
    enabled: !!tenant?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (input: { name: string; content: string; version_hash: string }) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return WaiverService.createDraft(tenant, input);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [TEMPLATES_KEY, tenant?.id] }),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return WaiverService.approveTemplate(tenant, id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [TEMPLATES_KEY, tenant?.id] }),
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return WaiverService.activateTemplate(tenant, id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [TEMPLATES_KEY, tenant?.id] }),
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return WaiverService.archiveTemplate(tenant, id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [TEMPLATES_KEY, tenant?.id] }),
  });

  return {
    templates: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error as Error | null,
    hasActiveTemplate: (listQuery.data ?? []).some((t) => t.status === 'active'),
    createDraft: createMutation.mutate,
    approveTemplate: approveMutation.mutate,
    activateTemplate: activateMutation.mutate,
    archiveTemplate: archiveMutation.mutate,
    isCreating: createMutation.isPending,
    isApproving: approveMutation.isPending,
    isActivating: activateMutation.isPending,
    isArchiving: archiveMutation.isPending,
  };
}
