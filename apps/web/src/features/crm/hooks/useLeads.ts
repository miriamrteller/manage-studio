import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { LeadService, type EnrolmentChoice, type LeadCreateInput, type LeadStage } from '../services/leadService';

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

  // Names for the enrolments leads point at (won or suggested).
  const linkedIds = Array.from(
    new Set(
      (listQuery.data ?? [])
        .flatMap((l) => [l.converted_engagement_id, l.suggested_engagement_id])
        .filter((id): id is string => Boolean(id)),
    ),
  ).sort();
  const enrolmentsQuery = useQuery({
    queryKey: ['lead-enrolments', tenant?.id, linkedIds.join(',')],
    queryFn: async () => (tenant && linkedIds.length ? LeadService.enrolments(tenant, linkedIds) : []),
    enabled: !!tenant?.id && linkedIds.length > 0,
  });

  const linkMutation = useMutation({
    mutationFn: async (params: { leadId: string; choice: EnrolmentChoice }) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return LeadService.linkToEnrolment(tenant, params.leadId, params.choice);
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return LeadService.remove(tenant, leadId);
    },
    onSuccess: invalidate,
  });

  const dismissMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return LeadService.dismissSuggestion(tenant, leadId);
    },
    onSuccess: invalidate,
  });

  return {
    enrolmentsById: new Map((enrolmentsQuery.data ?? []).map((e) => [e.id, e])),
    linkToEnrolment: linkMutation.mutate,
    linkError: linkMutation.error as Error | null,
    isLinking: linkMutation.isPending,
    dismissSuggestion: dismissMutation.mutate,
    leads: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error as Error | null,
    createLead: createMutation.mutate,
    isCreating: createMutation.isPending,
    updateStage: stageMutation.mutate,
    deleteLead: deleteMutation.mutate,
    deleteError: deleteMutation.error as Error | null,
    isDeleting: deleteMutation.isPending,
    isUpdatingStage: stageMutation.isPending,
  };
}
