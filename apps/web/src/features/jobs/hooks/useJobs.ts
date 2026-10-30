import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import {
  JobService,
  type ConvertLeadInput,
  type JobCreateInput,
  type JobDetailsUpdateInput,
} from '../services/jobService';

const KEY = 'jobs';

export function useJobs() {
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: [KEY, tenant?.id],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return JobService.list(tenant);
    },
    enabled: !!tenant?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (input: JobCreateInput) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return JobService.create(tenant, input);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY, tenant?.id] }),
  });

  return {
    jobs: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error as Error | null,
    createJob: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error as Error | null,
  };
}

export function useJobPackages() {
  const tenant = useTenant();
  return useQuery({
    queryKey: ['job-packages', tenant?.id],
    queryFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      return JobService.listPackages(tenant);
    },
    enabled: !!tenant?.id,
  });
}

export function useJob(engagementId: string | undefined) {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: [KEY, tenant?.id] });
    void queryClient.invalidateQueries({ queryKey: [KEY, tenant?.id, engagementId] });
  };

  const query = useQuery({
    queryKey: [KEY, tenant?.id, engagementId],
    queryFn: async () => {
      if (!tenant || !engagementId) throw new Error('Tenant not initialized');
      return JobService.get(tenant, engagementId);
    },
    enabled: !!tenant?.id && !!engagementId,
  });

  const detailsMutation = useMutation({
    mutationFn: async (input: JobDetailsUpdateInput) => {
      if (!tenant || !engagementId) throw new Error('Tenant not initialized');
      return JobService.updateDetails(tenant, engagementId, input);
    },
    onSuccess: invalidate,
  });

  const scheduleMutation = useMutation({
    mutationFn: async (schedule: { booked_starts_at: string | null; booked_ends_at: string | null }) => {
      if (!tenant || !engagementId) throw new Error('Tenant not initialized');
      return JobService.updateSchedule(tenant, engagementId, schedule);
    },
    onSuccess: invalidate,
  });

  const contractMutation = useMutation({
    mutationFn: async (recipientEmail: string) => {
      if (!engagementId) throw new Error('Job not loaded');
      return JobService.sendContractLink(engagementId, recipientEmail);
    },
    onSuccess: invalidate,
  });

  return {
    job: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    updateDetails: detailsMutation.mutateAsync,
    isUpdatingDetails: detailsMutation.isPending,
    updateSchedule: scheduleMutation.mutateAsync,
    isUpdatingSchedule: scheduleMutation.isPending,
    sendContract: contractMutation.mutateAsync,
    isSendingContract: contractMutation.isPending,
    contractError: contractMutation.error as Error | null,
    contractResult: contractMutation.data ?? null,
  };
}

export function useConvertLead() {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConvertLeadInput) => {
      if (!tenant) throw new Error('Tenant not initialized');
      return JobService.convertLead(tenant, input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads', tenant?.id] });
      void queryClient.invalidateQueries({ queryKey: [KEY, tenant?.id] });
    },
  });
}
