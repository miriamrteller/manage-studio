import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  JobPaymentService,
  type JobPaymentRequest,
  type JobPaymentRequestInput,
} from '../services/jobPaymentService';

export function jobPaymentRequestsKey(engagementId: string | undefined) {
  return ['job-payment-requests', engagementId] as const;
}

export function jobGalleryKey(engagementId: string | undefined) {
  return ['job-gallery', engagementId] as const;
}

export function useJobPaymentRequests(engagementId: string | undefined) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: jobPaymentRequestsKey(engagementId),
    queryFn: () => JobPaymentService.list(engagementId as string),
    enabled: Boolean(engagementId),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: jobPaymentRequestsKey(engagementId) });
    await queryClient.invalidateQueries({ queryKey: jobGalleryKey(engagementId) });
  };

  const create = useMutation({
    mutationFn: (requests: JobPaymentRequestInput[]) =>
      JobPaymentService.create(engagementId as string, requests),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: (params: { id: string; patch: Parameters<typeof JobPaymentService.update>[1] }) =>
      JobPaymentService.update(params.id, params.patch),
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: (params: { id: string; status: 'cancelled' | 'pending' }) =>
      JobPaymentService.setStatus(params.id, params.status),
    onSuccess: invalidate,
  });

  const sendLink = useMutation({
    mutationFn: (id: string) => JobPaymentService.sendLink(id),
    onSuccess: invalidate,
  });

  const recordManualPayment = useMutation({
    mutationFn: (params: { id: string; method: 'cash' | 'bank_transfer'; note?: string }) =>
      JobPaymentService.recordManualPayment(params.id, params.method, params.note),
    onSuccess: invalidate,
  });

  const recordManualRefund = useMutation({
    mutationFn: (params: { paymentId: string; reason?: string }) =>
      JobPaymentService.recordManualRefund(params.paymentId, params.reason),
    onSuccess: invalidate,
  });

  const requests: JobPaymentRequest[] = listQuery.data ?? [];

  return {
    requests,
    isLoading: listQuery.isLoading,
    error: listQuery.error as Error | null,
    create,
    update,
    setStatus,
    sendLink,
    recordManualPayment,
    recordManualRefund,
  };
}

export function useJobGallery(engagementId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: jobGalleryKey(engagementId),
    queryFn: () => JobPaymentService.getGallery(engagementId as string),
    enabled: Boolean(engagementId),
  });
  const release = useMutation({
    mutationFn: (releaseFlag: boolean) => JobPaymentService.releaseGallery(engagementId as string, releaseFlag),
    onSuccess: (data) => {
      queryClient.setQueryData(jobGalleryKey(engagementId), data);
    },
  });
  return { gallery: query.data ?? null, isLoading: query.isLoading, error: query.error as Error | null, release };
}
